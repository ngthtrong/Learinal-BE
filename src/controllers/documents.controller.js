/**
 * Documents Controller - Handles document upload, processing, and management
 * 
 * ARCHITECTURE:
 * - Uses memory storage (multer) for reliable multi-file uploads
 * - Saves files to disk only after validation
 * - Processes files via queue (if available) or inline
 * - Ensures file integrity throughout the pipeline
 */

const DocumentsRepository = require("../repositories/documents.repository");
const StorageClient = require("../adapters/storageClient");
const { env } = require("../config");
const jobs = require("../jobs");
const { enqueueDocumentIngestion } = require("../adapters/queue");
const fs = require("fs");
const path = require("path");

const docsRepo = new DocumentsRepository();
const _storage = new StorageClient(env);
const logger = require("../utils/logger");

// Upload directory - must match routes configuration
const uploadDir = path.resolve(__dirname, "../../uploads/pending");

function mapId(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

/**
 * Save buffer to file with guaranteed write
 */
async function saveBufferToFile(buffer, filePath) {
  await fs.promises.writeFile(filePath, buffer);
  // Verify file was written correctly
  const stats = await fs.promises.stat(filePath);
  if (stats.size !== buffer.length) {
    throw new Error(`File size mismatch: expected ${buffer.length}, got ${stats.size}`);
  }
  return filePath;
}

/**
 * Regenerate subject's table of contents after a document is deleted
 */
async function regenerateSubjectTocAfterDelete(subjectId, docsRepo, subjectsRepo, llmClient) {
  logger.info({ subjectId }, "[subject-toc] regenerating after document delete");

  const documents = await docsRepo.findMany(
    { subjectId, status: "Completed" },
    {
      projection: { originalFileName: 1, summaryShort: 1, summaryFull: 1, tableOfContents: 1 },
      sort: { uploadedAt: 1 },
    }
  );

  if (!documents || documents.length === 0) {
    await subjectsRepo.updateById(subjectId, { $set: { tableOfContents: [] } }, { new: true });
    logger.info({ subjectId }, "[subject-toc] cleared (no documents remaining)");
    return;
  }

  logger.info({ subjectId, docCount: documents.length }, "[subject-toc] regenerating from remaining documents");

  const { tableOfContents } = await llmClient.generateSubjectTableOfContents({ documents });

  if (tableOfContents && Array.isArray(tableOfContents) && tableOfContents.length > 0) {
    await subjectsRepo.updateById(subjectId, { $set: { tableOfContents } }, { new: true });
    logger.info({ subjectId, tocItems: tableOfContents.length }, "[subject-toc] regenerated successfully");
  } else {
    await subjectsRepo.updateById(subjectId, { $set: { tableOfContents: [] } }, { new: true });
    logger.warn({ subjectId }, "[subject-toc] cleared (LLM returned empty)");
  }
}

module.exports = {
  /**
   * POST /documents
   * Upload and process multiple documents
   * 
   * Flow:
   * 1. Receive files in memory (multer memoryStorage)
   * 2. Validate each file
   * 3. Save valid files to disk
   * 4. Create document records
   * 5. Queue/process ingestion jobs
   * 6. Return response with created documents
   */
  create: async (req, res, next) => {
    const savedFilePaths = []; // Track saved files for cleanup on error

    try {
      const user = req.user;
      const files = req.files || (req.file ? [req.file] : []);
      
      logger.info({
        userId: user?.id,
        subjectId: req.body?.subjectId,
        filesCount: files.length,
        files: files.map(f => ({ name: f.originalname, size: f.size }))
      }, "[documents.create] Processing upload request");

      if (files.length === 0) {
        return res.status(400).json({ 
          code: "ValidationError", 
          message: "No files provided" 
        });
      }

      // Ensure upload directory exists
      await fs.promises.mkdir(uploadDir, { recursive: true });

      const allowedExt = [".pdf", ".docx", ".txt"];
      const maxBytes = 20 * 1024 * 1024;
      const now = new Date();

      const createdDocuments = [];
      const errors = [];

      // Process each file sequentially to ensure reliability
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.originalname;
        
        try {
          const ext = path.extname(fileName).toLowerCase();
          
          // Validate extension
          if (!allowedExt.includes(ext)) {
            errors.push({ fileName, error: "Unsupported file type. Only .pdf, .docx, .txt allowed" });
            continue;
          }
          
          // Validate size
          if (file.size > maxBytes) {
            errors.push({ fileName, error: "File size exceeds 20MB limit" });
            continue;
          }

          // Generate unique filename and save to disk
          const timestamp = Date.now();
          const random = Math.random().toString(36).substring(2, 8);
          const savedFileName = `${timestamp}_${random}_${i}${ext}`;
          const filePath = path.join(uploadDir, savedFileName);
          
          // Save buffer to file
          await saveBufferToFile(file.buffer, filePath);
          savedFilePaths.push(filePath);
          
          logger.info({ 
            fileName, 
            savedAs: savedFileName, 
            size: file.size,
            path: filePath 
          }, "[documents.create] File saved to disk");

          // Create document record
          const docData = {
            subjectId: req.body.subjectId,
            ownerId: user.id,
            originalFileName: fileName,
            fileType: ext,
            fileSize: parseFloat((file.size / (1024 * 1024)).toFixed(2)),
            storagePath: filePath, // Full path to saved file
            status: "Processing",
            uploadedAt: now,
          };
          
          const created = await docsRepo.create(docData);
          createdDocuments.push(created);
          
          logger.info({ 
            documentId: String(created._id), 
            fileName 
          }, "[documents.create] Document record created");

          // Track usage
          const { usageTrackingRepository } = req.app.locals;
          if (usageTrackingRepository) {
            await usageTrackingRepository.trackAction(
              user.id, "document_upload",
              String(created._id),
              { subjectId: req.body.subjectId, fileName }
            ).catch(err => logger.warn({ err: err.message }, "[documents] Failed to track upload"));
          }

          // Queue ingestion job
          const jobPayload = {
            documentId: String(created._id),
            tempFilePath: filePath,
          };

          const useQueue = 
            (process.env.USE_QUEUE === "true" || process.env.USE_QUEUE === "1") &&
            !!process.env.REDIS_URL;

          if (useQueue) {
            await enqueueDocumentIngestion(jobPayload);
            logger.info({ documentId: jobPayload.documentId }, "[documents] Enqueued ingestion job");
          } else {
            // Process inline with small delay to not block response
            setImmediate(() => {
              jobs.documentIngestion(jobPayload).catch(err => {
                logger.error({ documentId: jobPayload.documentId, err: err.message }, "[documents] Inline ingestion failed");
              });
            });
            logger.info({ documentId: jobPayload.documentId }, "[documents] Scheduled inline ingestion");
          }

          // Consume addon quota if needed
          if (req.shouldConsumeAddonDocumentQuota) {
            const { addonPackagesService } = req.app.locals;
            if (addonPackagesService) {
              await addonPackagesService.tryConsumeAddonQuota(user.id, "document_upload")
                .catch(err => logger.warn({ err: err.message }, "[documents] Failed to consume addon quota"));
            }
          }

        } catch (fileError) {
          errors.push({ fileName, error: fileError.message });
          logger.error({ fileName, error: fileError.message }, "[documents.create] Failed to process file");
        }
      }

      // Return response
      if (createdDocuments.length === 0) {
        // Cleanup any saved files since all failed
        for (const p of savedFilePaths) {
          await fs.promises.unlink(p).catch(() => {});
        }
        return res.status(400).json({
          code: "ValidationError",
          message: "No files were uploaded successfully",
          errors
        });
      }

      const response = {
        documents: createdDocuments.map(mapId),
        successCount: createdDocuments.length,
        failureCount: errors.length
      };

      if (errors.length > 0) {
        response.errors = errors;
      }

      logger.info({
        successCount: createdDocuments.length,
        failureCount: errors.length
      }, "[documents.create] Upload completed");

      return res.status(201).json(response);

    } catch (e) {
      // Cleanup saved files on error
      for (const p of savedFilePaths) {
        await fs.promises.unlink(p).catch(() => {});
      }
      logger.error({ error: e.message }, "[documents.create] Upload failed");
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
      return res.status(200).json({
        summaryShort: doc.summaryShort || null,
        summaryFull: doc.summaryFull || null
      });
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

      // Delete file from storage
      if (doc.storagePath) {
        await _storage.delete(doc.storagePath).catch(err => {
          logger.warn({ err: err.message, storagePath: doc.storagePath }, "[documents] Failed to delete file");
        });
      }

      // Delete document record
      await docsRepo.deleteById(req.params.id);

      // Regenerate subject TOC in background
      if (subjectId) {
        const { subjectsRepository, llmClient } = req.app.locals;
        if (subjectsRepository && llmClient) {
          setImmediate(async () => {
            try {
              await regenerateSubjectTocAfterDelete(subjectId, docsRepo, subjectsRepository, llmClient);
            } catch (err) {
              logger.error({ subjectId, error: err.message }, "[documents] Failed to regenerate TOC");
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
      
      const page = Math.max(1, parseInt(req.query.page || "1", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || "20", 10)));

      const filter = { subjectId, ownerId: user.id };
      if (req.query.status) filter.status = req.query.status;

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
