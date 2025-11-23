const fs = require("fs");
const DocumentsRepository = require("../repositories/documents.repository");
const logger = require("../utils/logger");
const contentSummary = require("./content.summary");
const notificationService = require("../services/notification.service");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

module.exports = async function documentIngestion(payload) {
  const { documentId, tempFilePath } = payload || {};
  if (!documentId) return;
  const docsRepo = new DocumentsRepository();
  const doc = await docsRepo.findById(documentId);
  logger.info(
    { documentId, fileType: doc?.fileType, storagePath: doc?.storagePath },
    "[ingestion] start"
  );
  if (!doc) return;

  let extractedText = "";
  let tempFileToCleanup = tempFilePath || doc.storagePath;
  
  try {
    const storagePath = tempFilePath || doc.storagePath;
    if (!storagePath) throw new Error("Missing storagePath");

    if (doc.fileType === ".txt") {
      extractedText = await fs.promises.readFile(storagePath, "utf8");
    } else if (doc.fileType === ".pdf") {
      // Read buffer and parse with pdf-parse
      const buffer = await fs.promises.readFile(storagePath);
      const result = await pdfParse(buffer).catch((e) => {
        // Some PDFs may be encrypted or malformed
        throw new Error(`PDF parse failed: ${e?.message || e}`);
      });
      extractedText = result && result.text ? result.text : "";
      if (!extractedText) throw new Error("Empty text extracted from PDF");
    } else if (doc.fileType === ".docx") {
      // Extract raw text from DOCX using mammoth
      const result = await mammoth.extractRawText({ path: storagePath }).catch((e) => {
        throw new Error(`DOCX parse failed: ${e?.message || e}`);
      });
      extractedText = result && result.value ? result.value : "";
      if (!extractedText) throw new Error("Empty text extracted from DOCX");
    } else {
      throw new Error(`Unsupported fileType: ${doc.fileType}`);
    }
  } catch (e) {
    logger.error({ documentId, err: e?.message || e }, "[ingestion] failed");
    
    // Update status to Error
    await docsRepo.updateById(documentId, { 
      $set: { 
        status: "Error",
        storagePath: null // Clear temp path
      } 
    }, { new: true });
    
    // Cleanup temp file on error
    if (tempFileToCleanup) {
      try {
        await fs.promises.unlink(tempFileToCleanup);
        logger.info({ documentId, tempFile: tempFileToCleanup }, "[ingestion] cleaned up temp file after error");
      } catch (unlinkError) {
        logger.warn({ documentId, err: unlinkError.message }, "[ingestion] failed to cleanup temp file");
      }
    }
    
    return;
  }

  // Save extracted text and clear temp path
  await docsRepo.updateById(
    documentId,
    { $set: { extractedText, status: "Processing", storagePath: null } },
    { new: true }
  );
  logger.info({ documentId, length: extractedText.length }, "[ingestion] extracted text");

  // Cleanup temp file after successful extraction
  if (tempFileToCleanup) {
    try {
      await fs.promises.unlink(tempFileToCleanup);
      logger.info({ documentId, tempFile: tempFileToCleanup }, "[ingestion] cleaned up temp file");
    } catch (unlinkError) {
      logger.warn({ documentId, err: unlinkError.message }, "[ingestion] failed to cleanup temp file (non-critical)");
    }
  }

  // Trigger summary job next (inline for now)
  await contentSummary({ documentId });
  logger.info({ documentId }, "[ingestion] done");
  
  // Emit real-time notification
  const finalDoc = await docsRepo.findById(documentId);
  if (finalDoc && finalDoc.uploadedBy) {
    notificationService.emitDocumentProcessed(finalDoc.uploadedBy.toString(), finalDoc);
  }
};
