const DocumentsRepository = require('../repositories/documents.repository');
const SubjectsRepository = require('../repositories/subjects.repository');
const StorageClient = require('../adapters/storageClient');
const { storageConfig } = require('../config');
const logger = require('../utils/logger');

/**
 * File upload constraints
 */
const MAX_FILE_SIZE_MB = 20;
const ALLOWED_FILE_TYPES = ['.pdf', '.docx', '.txt'];
const MIME_TYPE_MAP = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
};

/**
 * Map MongoDB document to API DTO
 */
function mapId(doc) {
  if (!doc) return null;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

/**
 * DocumentsService - Business logic for document management
 * Handles upload, validation, storage, and lifecycle management
 */
class DocumentsService {
  constructor() {
    this.repo = new DocumentsRepository();
    this.subjectsRepo = new SubjectsRepository();
    this.storageClient = new StorageClient(storageConfig);
  }

  /**
   * Upload document to a subject
   * @param {string} userId
   * @param {string} subjectId
   * @param {object} file - Multer file object { originalname, buffer, mimetype, size }
   * @returns {Promise<object>} - Created document
   * @throws {ValidationError} if file validation fails
   * @throws {NotFound} if subject doesn't exist or user doesn't own it
   */
  async upload(userId, subjectId, file) {
    // 1. Validate subject ownership
    const subject = await this.subjectsRepo.findByIdAndUser(subjectId, userId);
    if (!subject) {
      throw { code: 'NotFound', message: 'Subject not found or access denied', status: 404 };
    }

    // 2. Validate file
    this._validateFile(file);

    // 3. Determine file type from MIME
    const fileType = MIME_TYPE_MAP[file.mimetype];
    if (!fileType) {
      throw {
        code: 'ValidationError',
        message: `Unsupported file type. Allowed: ${ALLOWED_FILE_TYPES.join(', ')}`,
        status: 400,
      };
    }

    // 4. Upload to storage
    const { storagePath } = await this.storageClient.upload(file, {
      userId,
      subjectId,
    });

    // 5. Create document record
    const document = {
      subjectId,
      ownerId: userId,
      originalFileName: file.originalname,
      fileType,
      fileSize: (file.size / (1024 * 1024)).toFixed(2), // bytes to MB
      storagePath,
      status: 'Uploading', // Will transition to Processing via background job
      uploadedAt: new Date(),
    };

    const created = await this.repo.create(document);

    // 6. Trigger background ingestion job (async)
    // TODO: Publish event to queue for document.ingestion job
    // await eventBus.publish('document.uploaded', { documentId: created._id });

    return mapId(created);
  }

  /**
   * Get document by ID with ownership check
   * @param {string} userId
   * @param {string} documentId
   * @returns {Promise<object>}
   * @throws {NotFound} if document doesn't exist or user doesn't own it
   */
  async getById(userId, documentId) {
    const doc = await this.repo.findByIdAndOwner(documentId, userId);
    if (!doc) {
      throw { code: 'NotFound', message: 'Document not found or access denied', status: 404 };
    }
    return mapId(doc);
  }

  /**
   * Get document summary (short/full)
   * @param {string} userId
   * @param {string} documentId
   * @returns {Promise<{short, full, updatedAt}>}
   * @throws {NotFound} if document doesn't exist or user doesn't own it
   */
  async getSummary(userId, documentId) {
    const doc = await this.repo.findByIdAndOwner(documentId, userId);
    if (!doc) {
      throw { code: 'NotFound', message: 'Document not found or access denied', status: 404 };
    }

    return {
      short: doc.summaryShort || null,
      full: doc.summaryFull || null,
      updatedAt: doc.summaryUpdatedAt || null,
    };
  }

  /**
   * List documents by subject with pagination
   * @param {string} userId
   * @param {string} subjectId
   * @param {object} options - { page, pageSize, sort }
   * @returns {Promise<{items, meta}>}
   * @throws {NotFound} if subject doesn't exist or user doesn't own it
   */
  async listBySubject(userId, subjectId, { page = 1, pageSize = 20, sort = '-uploadedAt' } = {}) {
    // Verify subject ownership
    const subject = await this.subjectsRepo.findByIdAndUser(subjectId, userId);
    if (!subject) {
      throw { code: 'NotFound', message: 'Subject not found or access denied', status: 404 };
    }

    const sortObj = this._parseSortParam(sort);
    const { items, totalItems, totalPages } = await this.repo.findBySubject(subjectId, {
      page,
      pageSize,
      sort: sortObj,
    });

    return {
      items: items.map(mapId),
      meta: { page, pageSize, totalItems, totalPages },
    };
  }

  /**
   * Delete document with ownership check
   * @param {string} userId
   * @param {string} documentId
   * @returns {Promise<void>}
   * @throws {NotFound} if document doesn't exist or user doesn't own it
   */
  async remove(userId, documentId) {
    // Get document first to access storagePath
    const doc = await this.repo.findByIdAndOwner(documentId, userId);
    if (!doc) {
      throw { code: 'NotFound', message: 'Document not found or access denied', status: 404 };
    }

    // Delete from storage (fire-and-forget)
    this.storageClient.delete(doc.storagePath).catch((err) => {
      logger.error({ documentId, storagePath: doc.storagePath, error: err.message }, 'Failed to delete file from storage');
    });

    // Delete from database
    await this.repo.deleteByIdAndOwner(documentId, userId);
  }

  /**
   * Validate uploaded file
   * @param {object} file
   * @throws {ValidationError}
   * @private
   */
  _validateFile(file) {
    if (!file) {
      throw { code: 'ValidationError', message: 'No file provided', status: 400 };
    }

    // Check file size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_FILE_SIZE_MB) {
      throw {
        code: 'ValidationError',
        message: `File size exceeds maximum allowed (${MAX_FILE_SIZE_MB} MB)`,
        status: 400,
        details: { fileSize: `${sizeMB.toFixed(2)} MB`, maxSize: `${MAX_FILE_SIZE_MB} MB` },
      };
    }

    // Check MIME type
    if (!MIME_TYPE_MAP[file.mimetype]) {
      throw {
        code: 'ValidationError',
        message: `Unsupported file type: ${file.mimetype}`,
        status: 400,
        details: { allowedTypes: ALLOWED_FILE_TYPES },
      };
    }
  }

  /**
   * Parse sort parameter
   * @param {string} sortParam - e.g., "-uploadedAt"
   * @returns {object} - e.g., { uploadedAt: -1 }
   * @private
   */
  _parseSortParam(sortParam) {
    if (!sortParam || typeof sortParam !== 'string') {
      return { uploadedAt: -1 };
    }

    const order = sortParam.startsWith('-') ? -1 : 1;
    const field = sortParam.startsWith('-') ? sortParam.slice(1) : sortParam;

    const allowedFields = ['uploadedAt', 'createdAt', 'originalFileName', 'fileSize'];
    if (!allowedFields.includes(field)) {
      return { uploadedAt: -1 };
    }

    return { [field]: order };
  }
}

module.exports = DocumentsService;
