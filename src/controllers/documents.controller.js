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

/**
 * Regenerate subject's table of contents after a document is deleted
 * If no documents remain, clear the subject's TOC
 */
async function regenerateSubjectTocAfterDelete(subjectId, docsRepo, subjectsRepo, llmClient) {
  logger.info({ subjectId }, "[subject-toc] regenerating after document delete");

  // Get all completed documents in this subject
  const documents = await docsRepo.findMany(
    { subjectId, status: "Completed" },
    {
      projection: {
        originalFileName: 1,
        summaryShort: 1,
        summaryFull: 1,
        tableOfContents: 1,
      },
      sort: { uploadedAt: 1 },
    }
  );

  // If no completed documents remain, clear the subject's TOC
  if (!documents || documents.length === 0) {
    await subjectsRepo.updateById(subjectId, { $set: { tableOfContents: [] } }, { new: true });
    logger.info({ subjectId }, "[subject-toc] cleared (no documents remaining)");
    return;
  }

  logger.info({ subjectId, docCount: documents.length }, "[subject-toc] regenerating from remaining documents");

  // Generate subject TOC from remaining documents
  const { tableOfContents } = await llmClient.generateSubjectTableOfContents({ documents });

  if (tableOfContents && Array.isArray(tableOfContents) && tableOfContents.length > 0) {
    await subjectsRepo.updateById(subjectId, { $set: { tableOfContents } }, { new: true });
    logger.info(
      {
        subjectId,
        tocItems: tableOfContents.length,
        topics: tableOfContents.map((t) => t.topicName),
      },
      "[subject-toc] regenerated successfully"
    );
  } else {
    // If LLM returns empty, clear the TOC
    await subjectsRepo.updateById(subjectId, { $set: { tableOfContents: [] } }, { new: true });
    logger.warn({ subjectId }, "[subject-toc] cleared (LLM returned empty)");
  }
}

module.exports = {
  // POST /documents (multipart/form-data with file)
  create: async (req, res, next) => {
    let tempFilePath = null;

    try {
      const user = req.user;
      
      // Debug logging
      logger.info(
        { 
          userId: user?.id,
          subjectId: req.body?.subjectId,
          file: req.file ? { name: req.file.originalname, size: req.file.size } : null,
          bodyKeys: Object.keys(req.body || {})
        },
        "[documents.create] Starting document upload"
      );
      
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

      // originalFileName is already properly decoded by multer fileFilter
      const toCreate = {
        subjectId: req.body.subjectId,
        ownerId: user.id,
        originalFileName: req.file.originalname,
        fileType: ext,
        fileSize: parseFloat((req.file.size / (1024 * 1024)).toFixed(2)), // Store as decimal MB
        storagePath: tempFilePath, // Temporary path
        status: "Processing",
        uploadedAt: now,
      };
      
      logger.info({ toCreate }, "[documents.create] Creating document with data");
      
      let created;
      try {
        created = await docsRepo.create(toCreate);
      } catch (createError) {
        logger.error(
          { 
            error: createError.message, 
            errors: createError.errors,
            toCreate 
          },
          "[documents.create] Failed to create document"
        );
        throw createError;
      }

      // Track document upload for quota counting (prevents abuse via delete)
      // Wrap in try-catch to not fail the upload if tracking fails
      const { usageTrackingRepository } = req.app.locals;
      if (usageTrackingRepository) {
        try {
          await usageTrackingRepository.trackAction(
            user.id,
            "document_upload",
            String(created._id || created.id),
            { subjectId: req.body.subjectId, fileName: req.file.originalname }
          );
          logger.info(
            { userId: user.id, documentId: String(created._id || created.id) },
            "[documents] Tracked document upload action"
          );
        } catch (trackingError) {
          // Log error but don't fail the upload
          logger.error(
            { userId: user.id, documentId: String(created._id || created.id), error: trackingError.message },
            "[documents] Failed to track document upload action - upload still successful"
          );
        }
      }

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

      // Consume addon quota if needed (when user exceeded subscription limit)
      if (req.shouldConsumeAddonDocumentQuota) {
        const { addonPackagesService } = req.app.locals;
        if (addonPackagesService) {
          try {
            await addonPackagesService.tryConsumeAddonQuota(user.id, "document_upload");
            logger.info(
              { userId: user.id, documentId: String(created._id || created.id) },
              "[documents] Consumed addon document quota"
            );
          } catch (err) {
            logger.warn(
              { userId: user.id, err: err?.message },
              "[documents] Failed to consume addon quota"
            );
          }
        }
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

      const subjectId = doc.subjectId;

      // Xóa file trong storage
      if (doc.storagePath) {
        await _storage.delete(doc.storagePath).catch((err) => {
          logger.warn(
            { err, storagePath: doc.storagePath },
            "[documents] Failed to delete file from storage"
          );
        });
      }

      // Xóa document từ database
      await docsRepo.deleteById(req.params.id);

      // Regenerate subject TOC after document deletion (async, don't block response)
      if (subjectId) {
        const { subjectsRepository, llmClient } = req.app.locals;
        if (subjectsRepository && llmClient) {
          // Run in background to not block response
          setImmediate(async () => {
            try {
              await regenerateSubjectTocAfterDelete(subjectId, docsRepo, subjectsRepository, llmClient);
            } catch (err) {
              logger.error(
                { subjectId, error: err.message },
                "[documents] Failed to regenerate subject TOC after delete"
              );
            }
          });
        }
      }

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
      const page = Math.max(1, parseInt(req.query.page || "1", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || "20", 10)));

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
