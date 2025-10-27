const DocumentsRepository = require("../repositories/documents.repository");
const StorageClient = require("../adapters/storageClient");
const { env } = require("../config");
const jobs = require("../jobs");
const { enqueueDocumentIngestion } = require("../adapters/queue");

const docsRepo = new DocumentsRepository();
const storage = new StorageClient(env);
const logger = require("../utils/logger");

function mapId(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

module.exports = {
  // POST /documents (multipart/form-data with file)
  create: async (req, res, next) => {
    try {
      const user = req.user;
      if (!req.file) {
        return res.status(400).json({ code: "ValidationError", message: "Missing file" });
      }
      const allowedExt = [".pdf", ".docx", ".txt"];
      const ext = req.file.originalname.slice(req.file.originalname.lastIndexOf(".")).toLowerCase();
      if (!allowedExt.includes(ext)) {
        return res
          .status(415)
          .json({ code: "UnsupportedMediaType", message: "Only .pdf, .docx, .txt allowed" });
      }
      const maxBytes = 20 * 1024 * 1024;
      if (req.file.size > maxBytes) {
        return res.status(413).json({ code: "PayloadTooLarge", message: "Max file size is 20MB" });
      }

      const uploaded = await storage.upload(req.file);
      const now = new Date();
      const toCreate = {
        subjectId: req.body.subjectId,
        ownerId: user.id,
        originalFileName: req.file.originalname,
        fileType: ext,
        fileSize: Math.round(req.file.size / (1024 * 1024)),
        storagePath: uploaded.storagePath,
        status: "Processing",
        uploadedAt: now,
      };
      const created = await docsRepo.create(toCreate);

      // Kick off ingestion + summary chain (prefer queue only when explicitly enabled)
      const jobPayload = { documentId: String(created._id || created.id) };
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
};
