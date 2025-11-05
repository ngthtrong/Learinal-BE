const DocumentsRepository = require("../repositories/documents.repository");
const StorageClient = require("../adapters/storageClient");
const { env } = require("../config");
const jobs = require("../jobs");
const { enqueueDocumentIngestion } = require("../adapters/queue");
const fs = require("fs");

const docsRepo = new DocumentsRepository();
const _storage = new StorageClient(env);
const logger = require("../utils/logger");

function mapId(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

module.exports = {
  // POST /documents (multipart/form-data with file)
  create: async (req, res, next) => {
    let tempFilePath = null;

    try {
      const user = req.user;
      if (!req.file) {
        return res.status(400).json({ code: "ValidationError", message: "Missing file" });
      }

      // Store temp file path for cleanup on error
      tempFilePath = req.file.path;

      const allowedExt = [".pdf", ".docx", ".txt"];
      const ext = req.file.originalname.slice(req.file.originalname.lastIndexOf(".")).toLowerCase();
      if (!allowedExt.includes(ext)) {
        // Cleanup temp file on validation error
        await fs.promises.unlink(tempFilePath).catch(() => {});
        return res
          .status(415)
          .json({ code: "UnsupportedMediaType", message: "Only .pdf, .docx, .txt allowed" });
      }
      const maxBytes = 20 * 1024 * 1024;
      if (req.file.size > maxBytes) {
        // Cleanup temp file on validation error
        await fs.promises.unlink(tempFilePath).catch(() => {});
        return res.status(413).json({ code: "PayloadTooLarge", message: "Max file size is 20MB" });
      }

      const now = new Date();
      const toCreate = {
        subjectId: req.body.subjectId,
        ownerId: user.id,
        originalFileName: req.file.originalname,
        fileType: ext,
        fileSize: Math.round(req.file.size / (1024 * 1024)),
        storagePath: tempFilePath, // Temporary path
        status: "Processing",
        uploadedAt: now,
      };
      const created = await docsRepo.create(toCreate);

      // Kick off ingestion + summary chain (prefer queue only when explicitly enabled)
      const jobPayload = {
        documentId: String(created._id || created.id),
        tempFilePath: tempFilePath, // Pass temp file path to job
      };
      const useQueue =
        (process.env.USE_QUEUE === "true" || process.env.USE_QUEUE === "1") &&
        !!process.env.REDIS_URL;
      try {
        if (useQueue) {
          await enqueueDocumentIngestion(jobPayload);
          logger.info({ documentId: jobPayload.documentId }, "[documents] enqueued ingestion");
          // Watchdog: if queue doesn't pick up within 10s, run inline fallback
          setTimeout(async () => {
            try {
              const latest = await docsRepo.findById(jobPayload.documentId);
              const noText = !latest?.extractedText || String(latest.extractedText).length === 0;
              if (latest && latest.status === "Processing" && noText) {
                logger.warn(
                  { documentId: jobPayload.documentId },
                  "[documents] queue not processed in 10s, running inline fallback"
                );
                await jobs.documentIngestion(jobPayload);
              }
            } catch {}
          }, 10_000);
        } else {
          // Inline processing for local/dev or when worker is not running
          setTimeout(() => {
            jobs.documentIngestion(jobPayload);
          }, 5);
          logger.info(
            { documentId: jobPayload.documentId },
            "[documents] scheduled inline ingestion"
          );
        }
      } catch (e) {
        // Fallback inline if queue enqueue fails
        setTimeout(() => {
          jobs.documentIngestion(jobPayload);
        }, 5);
        logger.warn(
          { documentId: jobPayload.documentId, err: e?.message || e },
          "[documents] enqueue failed; falling back to inline ingestion"
        );
      }

      return res.status(201).json(mapId(created));
    } catch (e) {
      // Cleanup temp file on any error
      if (tempFilePath) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
      }
      next(e);
    }
  },

  // GET /documents/:id
  get: async (req, res, next) => {
    try {
      const user = req.user;
      const doc = await docsRepo.findById(req.params.id);
      if (!doc || String(doc.ownerId) !== String(user.id)) {
        return res.status(404).json({ code: "NotFound", message: "Document not found" });
      }
      return res.status(200).json(mapId(doc));
    } catch (e) {
      next(e);
    }
  },

  // GET /documents/:id/summary
  summary: async (req, res, next) => {
    try {
      const user = req.user;
      const doc = await docsRepo.findById(req.params.id);
      if (!doc || String(doc.ownerId) !== String(user.id)) {
        return res.status(404).json({ code: "NotFound", message: "Document not found" });
      }
      const { summaryShort, summaryFull } = doc;
      return res
        .status(200)
        .json({ summaryShort: summaryShort || null, summaryFull: summaryFull || null });
    } catch (e) {
      next(e);
    }
  },

  // DELETE /documents/:id
  remove: async (req, res, next) => {
    try {
      const user = req.user;
      const doc = await docsRepo.findById(req.params.id);
      if (!doc || String(doc.ownerId) !== String(user.id)) {
        return res.status(404).json({ code: "NotFound", message: "Document not found" });
      }

      // Xóa file trong storage
      if (doc.storagePath) {
        await _storage.delete(doc.storagePath).catch((err) => {
          logger.warn({ err, storagePath: doc.storagePath }, "[documents] Failed to delete file from storage");
        });
      }

      // Xóa document từ database
      await docsRepo.deleteById(req.params.id);
      
      return res.status(204).send();
    } catch (e) {
      next(e);
    }
  },

  // GET /subjects/:subjectId/documents
  listBySubject: async (req, res, next) => {
    try {
      const user = req.user;
      const { subjectId } = req.params;
      
      // Validate và parse pagination params
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
      
      // Filter: chỉ lấy documents của user hiện tại và subject được chỉ định
      const filter = {
        subjectId,
        ownerId: user.id,
      };
      
      // Optional status filter
      if (req.query.status) {
        filter.status = req.query.status;
      }
      
      const result = await docsRepo.paginate(filter, {
        page,
        pageSize,
        sort: { uploadedAt: -1 },
      });
      
      return res.status(200).json({
        items: result.items.map(mapId),
        meta: {
          page: result.meta.page,
          pageSize: result.meta.pageSize,
          total: result.meta.totalItems,
          totalPages: result.meta.totalPages,
        },
      });
    } catch (e) {
      next(e);
    }
  },
};
