const DocumentsRepository = require("../repositories/documents.repository");
const SubjectsRepository = require("../repositories/subjects.repository");
const { llm } = require("../config");
const LLMClient = require("../adapters/llmClient");
const notificationService = require("../services/notification.service");
const logger = require("../utils/logger");

module.exports = async function contentSummary(payload) {
  const { documentId } = payload || {};
  if (!documentId) return;
  const docsRepo = new DocumentsRepository();
  const subjectsRepo = new SubjectsRepository();
  const doc = await docsRepo.findById(documentId);
  if (!doc) return;

  const client = new LLMClient(llm);
  
  // Check if document processing is needed
  const needsProcessing = !((doc.summaryShort || doc.summaryFull) && doc.status === "Completed");
  
  if (!needsProcessing) {
    logger.info({ documentId }, "[summary] skip already completed, but will update subject TOC");
    
    // Even if document is completed, update subject TOC
    if (doc.subjectId) {
      try {
        await updateSubjectTableOfContents(doc.subjectId, docsRepo, subjectsRepo, client);
      } catch (subjectTocError) {
        logger.error({ 
          documentId, 
          subjectId: doc.subjectId, 
          err: subjectTocError?.message || subjectTocError 
        }, "[summary] failed to update subject TOC (non-fatal)");
      }
    }
    return;
  }

  try {
    logger.info({ documentId, textLen: (doc.extractedText || "").length }, "[summary] start");
    
    // Generate both summary and table of contents in parallel
    const [summaryResult, tocResult] = await Promise.allSettled([
      client.summarize({ text: doc.extractedText || "" }),
      client.generateTableOfContents({ text: doc.extractedText || "" })
    ]);

    // Extract results
    const { summaryShort, summaryFull } = summaryResult.status === 'fulfilled' 
      ? summaryResult.value 
      : { summaryShort: '', summaryFull: '' };
    
    const { tableOfContents } = tocResult.status === 'fulfilled'
      ? tocResult.value
      : { tableOfContents: [] };

    // Update document with all generated content
    const updateData = {
      summaryShort,
      summaryFull,
      summaryUpdatedAt: new Date(),
      status: "Completed"
    };

    // Only add tableOfContents if it was successfully generated
    if (tableOfContents && Array.isArray(tableOfContents) && tableOfContents.length > 0) {
      updateData.tableOfContents = tableOfContents;
      logger.info({ documentId, tocItems: tableOfContents.length }, "[summary] document TOC generated");
    }

    await docsRepo.updateById(
      documentId,
      { $set: updateData },
      { new: true }
    );
    
    logger.info({ documentId, hasTOC: !!updateData.tableOfContents }, "[summary] document completed");

    // Send notification after document is completed
    const finalDoc = await docsRepo.findById(documentId);
    logger.info({ 
      documentId, 
      ownerId: finalDoc?.ownerId, 
      hasOwnerId: !!finalDoc?.ownerId 
    }, "[summary] checking ownerId for notification");
    
    if (finalDoc && finalDoc.ownerId) {
      await notificationService.emitDocumentProcessed(finalDoc.ownerId.toString(), finalDoc);
      logger.info({ documentId, userId: finalDoc.ownerId }, "[summary] notification sent");
    } else {
      logger.warn({ documentId, doc: finalDoc }, "[summary] no ownerId found, cannot send notification");
    }

    // After document is completed, update subject's table of contents
    if (doc.subjectId) {
      try {
        await updateSubjectTableOfContents(doc.subjectId, docsRepo, subjectsRepo, client);
      } catch (subjectTocError) {
        // Non-fatal: log error but don't fail the whole job
        logger.error({ 
          documentId, 
          subjectId: doc.subjectId, 
          err: subjectTocError?.message || subjectTocError,
          stack: subjectTocError?.stack
        }, "[summary] failed to update subject TOC (non-fatal)");
      }
    }
  } catch (e) {
    logger.error({ documentId, err: e?.message || e, stack: e?.stack }, "[summary] failed");
    await docsRepo.updateById(documentId, { $set: { status: "Error" } }, { new: true });
    
    // Send error notification
    const failedDoc = await docsRepo.findById(documentId);
    logger.info({ 
      documentId, 
      ownerId: failedDoc?.ownerId, 
      hasOwnerId: !!failedDoc?.ownerId 
    }, "[summary] checking ownerId for error notification");
    
    if (failedDoc && failedDoc.ownerId) {
      await notificationService.emitDocumentProcessed(failedDoc.ownerId.toString(), failedDoc);
      logger.info({ documentId, userId: failedDoc.ownerId }, "[summary] error notification sent");
    } else {
      logger.warn({ documentId, doc: failedDoc }, "[summary] no ownerId found, cannot send error notification");
    }
  }
};

/**
 * Update subject's table of contents based on all completed documents
 */
async function updateSubjectTableOfContents(subjectId, docsRepo, subjectsRepo, llmClient) {
  logger.info({ subjectId }, "[subject-toc] start updating subject table of contents");
  
  // Get the subject
  const subject = await subjectsRepo.findById(subjectId);
  if (!subject) {
    logger.warn({ subjectId }, "[subject-toc] subject not found");
    return;
  }

  // Get all completed documents in this subject
  const documents = await docsRepo.findMany(
    { subjectId, status: "Completed" },
    {
      projection: { 
        originalFileName: 1, 
        summaryShort: 1, 
        summaryFull: 1, 
        tableOfContents: 1 
      },
      sort: { uploadedAt: 1 }
    }
  );

  if (!documents || documents.length === 0) {
    logger.info({ subjectId }, "[subject-toc] no completed documents, skipping");
    return;
  }

  logger.info({ subjectId, docCount: documents.length }, "[subject-toc] generating from documents");

  // Generate subject TOC from all documents
  const { tableOfContents } = await llmClient.generateSubjectTableOfContents({ documents });

  if (tableOfContents && Array.isArray(tableOfContents) && tableOfContents.length > 0) {
    // Update subject with new TOC
    await subjectsRepo.updateById(
      subjectId,
      { $set: { tableOfContents } },
      { new: true }
    );
    logger.info({ 
      subjectId, 
      tocItems: tableOfContents.length,
      topics: tableOfContents.map(t => t.topicName)
    }, "[subject-toc] updated successfully");
  } else {
    logger.warn({ subjectId }, "[subject-toc] no TOC generated");
  }
}
