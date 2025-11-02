const DocumentsRepository = require("../repositories/documents.repository");
const { llm } = require("../config");
const LLMClient = require("../adapters/llmClient");
const logger = require("../utils/logger");

module.exports = async function contentSummary(payload) {
  const { documentId } = payload || {};
  if (!documentId) return;
  const docsRepo = new DocumentsRepository();
  const doc = await docsRepo.findById(documentId);
  if (!doc) return;

  // Idempotency: if already summarized and marked Completed, skip
  if ((doc.summaryShort || doc.summaryFull) && doc.status === "Completed") {
    logger.info({ documentId }, "[summary] skip already completed");
    return;
  }

  const client = new LLMClient(llm);
  try {
    logger.info({ documentId, textLen: (doc.extractedText || "").length }, "[summary] start");
    const { summaryShort, summaryFull } = await client.summarize({ text: doc.extractedText || "" });
    await docsRepo.updateById(
      documentId,
      { $set: { summaryShort, summaryFull, summaryUpdatedAt: new Date(), status: "Completed" } },
      { new: true }
    );
    logger.info({ documentId }, "[summary] completed");
  } catch (e) {
    logger.error({ documentId, err: e?.message || e, stack: e?.stack }, "[summary] failed");
    await docsRepo.updateById(documentId, { $set: { status: "Error" } }, { new: true });
  }
};
