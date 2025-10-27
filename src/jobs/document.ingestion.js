const fs = require("fs");
const DocumentsRepository = require("../repositories/documents.repository");
const logger = require("../utils/logger");
const contentSummary = require("./content.summary");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

module.exports = async function documentIngestion(payload) {
  const { documentId } = payload || {};
  if (!documentId) return;
  const docsRepo = new DocumentsRepository();
  const doc = await docsRepo.findById(documentId);
  logger.info(
    { documentId, fileType: doc?.fileType, storagePath: doc?.storagePath },
    "[ingestion] start"
  );
  if (!doc) return;

  let extractedText = "";
  try {
    const storagePath = doc.storagePath;
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
    await docsRepo.updateById(documentId, { $set: { status: "Error" } }, { new: true });
    return;
  }

  await docsRepo.updateById(
    documentId,
    { $set: { extractedText, status: "Processing" } },
    { new: true }
  );
  logger.info({ documentId, length: extractedText.length }, "[ingestion] extracted text");

  // Trigger summary job next (inline for now)
  await contentSummary({ documentId });
  logger.info({ documentId }, "[ingestion] done");
};
