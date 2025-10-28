const DocumentsRepository = require('../repositories/documents.repository');
const SubjectsRepository = require('../repositories/subjects.repository');
const LLMClient = require('../adapters/llmClient');
const { llm } = require('../config');
const logger = require('../utils/logger');

/**
 * Content Summary Job
 * Generates short and full summaries from extracted document text using LLM
 * Also updates subject summary with aggregated content
 * 
 * @param {object} payload - { documentId }
 */
async function contentSummary(payload) {
  const { documentId } = payload || {};
  
  if (!documentId) {
    logger.warn('[summary] Missing documentId in payload');
    return;
  }

  const docsRepo = new DocumentsRepository();
  const subjectsRepo = new SubjectsRepository();

  try {
    // Fetch document
    const doc = await docsRepo.findById(documentId);
    if (!doc) {
      logger.warn({ documentId }, '[summary] Document not found');
      return;
    }

    logger.info(
      { documentId, textLength: (doc.extractedText || '').length },
      '[summary] Starting summary generation'
    );

    // Idempotency check: Skip if already summarized
    if (doc.summaryShort && doc.summaryFull && doc.status === 'Completed') {
      logger.info({ documentId }, '[summary] Already completed, skipping');
      return;
    }

    // Validate extracted text exists
    if (!doc.extractedText || doc.extractedText.trim().length === 0) {
      throw new Error('No extracted text available for summarization');
    }

    // Check if text is too short for meaningful summary
    const minLength = 50;
    if (doc.extractedText.trim().length < minLength) {
      logger.warn(
        { documentId, textLength: doc.extractedText.length },
        '[summary] Text too short for summarization'
      );
      
      // Use extracted text as summary for short documents
      await docsRepo.updateStatus(documentId, 'Completed', {
        summaryShort: doc.extractedText.slice(0, 200),
        summaryFull: doc.extractedText,
        summaryUpdatedAt: new Date(),
      });
      
      return;
    }

    // Generate summary via LLM
    const llmClient = new LLMClient(llm);
    const { summaryShort, summaryFull } = await llmClient.summarize({
      text: doc.extractedText,
    });

    // Validate LLM response
    if (!summaryShort || !summaryFull) {
      throw new Error('LLM returned empty summaries');
    }

    // Update document with summaries
    await docsRepo.updateStatus(documentId, 'Completed', {
      summaryShort: summaryShort.trim(),
      summaryFull: summaryFull.trim(),
      summaryUpdatedAt: new Date(),
    });

    logger.info(
      {
        documentId,
        shortLength: summaryShort.length,
        fullLength: summaryFull.length,
      },
      '[summary] Summary generation completed'
    );

    // Update subject summary (aggregate all document summaries)
    if (doc.subjectId) {
      await updateSubjectSummary(doc.subjectId, subjectsRepo, docsRepo);
    }

  } catch (error) {
    logger.error(
      { documentId, error: error.message, stack: error.stack },
      '[summary] Summary generation failed'
    );

    // Update document status to Error
    try {
      await docsRepo.updateStatus(documentId, 'Error');
    } catch (updateErr) {
      logger.error(
        { documentId, error: updateErr.message },
        '[summary] Failed to update error status'
      );
    }
  }
}

/**
 * Update subject summary by aggregating all document summaries
 * This creates a comprehensive overview of all content in the subject
 * 
 * @param {string} subjectId
 * @param {SubjectsRepository} subjectsRepo
 * @param {DocumentsRepository} docsRepo
 */
async function updateSubjectSummary(subjectId, subjectsRepo, docsRepo) {
  try {
    // Get all completed documents for this subject
    const { items: documents } = await docsRepo.findBySubject(subjectId, {
      page: 1,
      pageSize: 100, // Limit to first 100 documents
      sort: { uploadedAt: -1 },
    });

    const completedDocs = documents.filter(
      (d) => d.status === 'Completed' && d.summaryShort
    );

    if (completedDocs.length === 0) {
      logger.debug({ subjectId }, '[summary] No completed documents to aggregate');
      return;
    }

    // Aggregate summaries
    const aggregatedSummary = completedDocs
      .map((doc, index) => {
        const title = doc.originalFileName || `Document ${index + 1}`;
        return `**${title}**\n${doc.summaryShort}`;
      })
      .join('\n\n---\n\n');

    // Update subject summary
    await subjectsRepo.updateById(subjectId, {
      $set: { summary: aggregatedSummary },
    });

    logger.info(
      { subjectId, documentCount: completedDocs.length },
      '[summary] Subject summary updated'
    );

  } catch (error) {
    logger.warn(
      { subjectId, error: error.message },
      '[summary] Failed to update subject summary'
    );
    // Don't throw - this is a nice-to-have, not critical
  }
}

module.exports = contentSummary;
