const DocumentsRepository = require('../repositories/documents.repository');
const { llm } = require('../config');
const LLMClient = require('../adapters/llmClient');

module.exports = async function contentSummary(payload) {
  const { documentId } = payload || {};
  if (!documentId) return;
  const docsRepo = new DocumentsRepository();
  const doc = await docsRepo.findById(documentId);
  if (!doc) return;

  // Idempotency: if already summarized and marked Completed, skip
  if ((doc.summaryShort || doc.summaryFull) && doc.status === 'Completed') {
    // eslint-disable-next-line no-console
    console.log(`[summary] skip already completed documentId=${documentId}`);
    return;
  }

  const client = new LLMClient(llm);
  try {
    // eslint-disable-next-line no-console
    console.log(`[summary] start documentId=${documentId}, textLen=${(doc.extractedText || '').length}`);
    const { summaryShort, summaryFull } = await client.summarize({ text: doc.extractedText || '' });
    await docsRepo.updateById(documentId, { $set: { summaryShort, summaryFull, summaryUpdatedAt: new Date(), status: 'Completed' } }, { new: true });
    // eslint-disable-next-line no-console
    console.log(`[summary] completed documentId=${documentId}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[summary] failed documentId=${documentId}:`, e?.message || e);
    await docsRepo.updateById(documentId, { $set: { status: 'Error' } }, { new: true });
  }
};
