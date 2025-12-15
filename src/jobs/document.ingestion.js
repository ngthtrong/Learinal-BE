/**
 * Document Ingestion Job
 * 
 * Processes uploaded documents:
 * 1. Read file from disk (storagePath)
 * 2. Extract text based on file type
 * 3. Update document with extracted text
 * 4. Cleanup temp file
 * 5. Trigger content summary generation
 */

const fs = require("fs");
const path = require("path");
const DocumentsRepository = require("../repositories/documents.repository");
const logger = require("../utils/logger");
const contentSummary = require("./content.summary");
const notificationService = require("../services/notification.service");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

/**
 * Main ingestion function
 * @param {Object} payload - Job payload
 * @param {string} payload.documentId - Document ID to process
 * @param {string} payload.tempFilePath - Path to the uploaded file
 */
module.exports = async function documentIngestion(payload) {
  const { documentId, tempFilePath } = payload || {};
  
  if (!documentId) {
    logger.error("[ingestion] Missing documentId in payload");
    return;
  }

  const docsRepo = new DocumentsRepository();
  const doc = await docsRepo.findById(documentId);
  
  if (!doc) {
    logger.error({ documentId }, "[ingestion] Document not found");
    return;
  }

  // Determine file path: prefer tempFilePath from job, fallback to doc.storagePath
  const filePath = tempFilePath || doc.storagePath;
  
  logger.info({
    documentId,
    fileName: doc.originalFileName,
    fileType: doc.fileType,
    filePath,
    hasJobPath: !!tempFilePath,
    hasDocPath: !!doc.storagePath
  }, "[ingestion] Starting document processing");

  // Validate file path exists
  if (!filePath) {
    await handleIngestionError(docsRepo, documentId, doc, "No file path available");
    return;
  }

  // Check file exists on disk
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch (err) {
    await handleIngestionError(docsRepo, documentId, doc, `File not found: ${filePath}`);
    return;
  }

  let extractedText = "";

  try {
    // Extract text based on file type
    switch (doc.fileType) {
      case ".txt":
        extractedText = await fs.promises.readFile(filePath, "utf8");
        break;
        
      case ".pdf":
        const pdfBuffer = await fs.promises.readFile(filePath);
        const pdfResult = await pdfParse(pdfBuffer);
        extractedText = pdfResult?.text || "";
        if (!extractedText.trim()) {
          throw new Error("PDF extraction returned empty text");
        }
        break;
        
      case ".docx":
        const docxResult = await mammoth.extractRawText({ path: filePath });
        extractedText = docxResult?.value || "";
        if (!extractedText.trim()) {
          throw new Error("DOCX extraction returned empty text");
        }
        break;
        
      default:
        throw new Error(`Unsupported file type: ${doc.fileType}`);
    }

    logger.info({
      documentId,
      textLength: extractedText.length,
      preview: extractedText.substring(0, 100)
    }, "[ingestion] Text extracted successfully");

    // Update document with extracted text
    await docsRepo.updateById(documentId, {
      $set: {
        extractedText,
        status: "Processing", // Still processing (summary generation next)
        storagePath: null // Clear temp path
      }
    }, { new: true });

    // Cleanup temp file
    await cleanupFile(filePath, documentId);

    // Continue to content summary generation
    logger.info({ documentId }, "[ingestion] Starting content summary");
    await contentSummary({ documentId });
    
    logger.info({ documentId }, "[ingestion] Completed successfully");

  } catch (error) {
    logger.error({
      documentId,
      error: error.message,
      stack: error.stack
    }, "[ingestion] Processing failed");

    await handleIngestionError(docsRepo, documentId, doc, error.message);
    await cleanupFile(filePath, documentId);
  }
};

/**
 * Handle ingestion error - update document status and notify user
 */
async function handleIngestionError(docsRepo, documentId, doc, errorMessage) {
  try {
    // Update document status to Error
    await docsRepo.updateById(documentId, {
      $set: {
        status: "Error",
        storagePath: null
      }
    }, { new: true });

    // Send error notification to user
    if (doc?.ownerId) {
      const errorDoc = await docsRepo.findById(documentId);
      await notificationService.emitDocumentProcessed(doc.ownerId.toString(), errorDoc);
      logger.info({
        documentId,
        userId: doc.ownerId
      }, "[ingestion] Error notification sent");
    }
  } catch (err) {
    logger.error({
      documentId,
      error: err.message
    }, "[ingestion] Failed to handle error");
  }
}

/**
 * Cleanup temp file safely
 */
async function cleanupFile(filePath, documentId) {
  if (!filePath) return;
  
  try {
    await fs.promises.unlink(filePath);
    logger.info({ documentId, filePath }, "[ingestion] Temp file cleaned up");
  } catch (err) {
    // File might already be deleted, ignore error
    if (err.code !== "ENOENT") {
      logger.warn({
        documentId,
        filePath,
        error: err.message
      }, "[ingestion] Failed to cleanup temp file");
    }
  }
}
