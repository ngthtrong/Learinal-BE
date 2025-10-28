const fs = require('fs');
const DocumentsRepository = require('../repositories/documents.repository');
const logger = require('../utils/logger');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Document Ingestion Job
 * Extracts text from uploaded documents (.pdf, .docx, .txt)
 * Updates document status and triggers summary generation
 * 
 * @param {object} payload - { documentId }
 */
async function documentIngestion(payload) {
  const { documentId } = payload || {};
  
  if (!documentId) {
    logger.warn('[ingestion] Missing documentId in payload');
    return;
  }

  const docsRepo = new DocumentsRepository();
  
  try {
    // Fetch document
    const doc = await docsRepo.findById(documentId);
    if (!doc) {
      logger.warn({ documentId }, '[ingestion] Document not found');
      return;
    }

    logger.info(
      { documentId, fileType: doc.fileType, status: doc.status },
      '[ingestion] Starting text extraction'
    );

    // Idempotency check: Skip if already processed
    if (doc.extractedText && doc.extractedText.length > 0) {
      logger.info({ documentId }, '[ingestion] Text already extracted, skipping');
      
      // Trigger summary if not yet done
      if (!doc.summaryShort && !doc.summaryFull) {
        await triggerSummaryJob(documentId);
      }
      return;
    }

    // Validate storage path exists
    if (!doc.storagePath) {
      throw new Error('Missing storagePath in document record');
    }

    // Check file exists
    try {
      await fs.promises.access(doc.storagePath, fs.constants.R_OK);
    } catch {
      throw new Error(`File not accessible at storagePath: ${doc.storagePath}`);
    }

    // Extract text based on file type
    let extractedText = '';
    
    if (doc.fileType === '.txt') {
      extractedText = await extractTextFile(doc.storagePath);
    } else if (doc.fileType === '.pdf') {
      extractedText = await extractPdfFile(doc.storagePath);
    } else if (doc.fileType === '.docx') {
      extractedText = await extractDocxFile(doc.storagePath);
    } else {
      throw new Error(`Unsupported file type: ${doc.fileType}`);
    }

    // Validate extracted text
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text content extracted from document');
    }

    // Update document with extracted text
    await docsRepo.updateStatus(documentId, 'Processing', {
      extractedText: extractedText.trim(),
    });

    logger.info(
      { documentId, extractedLength: extractedText.length },
      '[ingestion] Text extraction completed'
    );

    // Trigger summary generation
    await triggerSummaryJob(documentId);

  } catch (error) {
    logger.error(
      { documentId, error: error.message, stack: error.stack },
      '[ingestion] Text extraction failed'
    );

    // Update document status to Error
    try {
      await docsRepo.updateStatus(documentId, 'Error');
    } catch (updateErr) {
      logger.error({ documentId, error: updateErr.message }, '[ingestion] Failed to update error status');
    }
  }
}

/**
 * Extract text from .txt file
 */
async function extractTextFile(filePath) {
  try {
    const text = await fs.promises.readFile(filePath, 'utf-8');
    return text;
  } catch (err) {
    throw new Error(`Failed to read .txt file: ${err.message}`);
  }
}

/**
 * Extract text from .pdf file using pdf-parse
 */
async function extractPdfFile(filePath) {
  try {
    const buffer = await fs.promises.readFile(filePath);
    const pdfData = await pdfParse(buffer, {
      max: 0, // Parse all pages
    });

    if (!pdfData || !pdfData.text) {
      throw new Error('PDF parsing returned no text');
    }

    return pdfData.text;
  } catch (err) {
    throw new Error(`Failed to parse .pdf file: ${err.message}`);
  }
}

/**
 * Extract text from .docx file using mammoth
 */
async function extractDocxFile(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    
    if (!result || !result.value) {
      throw new Error('DOCX parsing returned no text');
    }

    // Log any warnings from mammoth (e.g., unsupported elements)
    if (result.messages && result.messages.length > 0) {
      logger.debug({ messages: result.messages }, '[ingestion] Mammoth warnings');
    }

    return result.value;
  } catch (err) {
    throw new Error(`Failed to parse .docx file: ${err.message}`);
  }
}

/**
 * Trigger summary generation job
 * Inline execution for now; can be replaced with queue publish
 */
async function triggerSummaryJob(documentId) {
  try {
    const contentSummary = require('./content.summary');
    
    // Execute inline (could be replaced with queue.publish later)
    // Use setTimeout instead of setImmediate for Node.js compatibility
    setTimeout(() => {
      contentSummary({ documentId }).catch((err) => {
        logger.error({ documentId, error: err.message }, '[ingestion] Summary job failed');
      });
    }, 0);

    logger.info({ documentId }, '[ingestion] Summary job triggered');
  } catch (err) {
    logger.warn({ documentId, error: err.message }, '[ingestion] Failed to trigger summary job');
  }
}

module.exports = documentIngestion;
