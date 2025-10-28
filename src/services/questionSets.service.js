const QuestionSetsRepository = require('../repositories/questionSets.repository');
const SubjectsRepository = require('../repositories/subjects.repository');
const DocumentsRepository = require('../repositories/documents.repository');
const LLMClient = require('../adapters/llmClient');
const { llm } = require('../config');
const logger = require('../utils/logger');

/**
 * Map MongoDB document to API DTO
 */
function mapId(doc) {
  if (!doc) return null;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

/**
 * QuestionSetsService - Business logic for question sets management
 * Handles CRUD, generation via LLM, sharing, and review workflows
 */
class QuestionSetsService {
  constructor() {
    this.repo = new QuestionSetsRepository();
    this.subjectsRepo = new SubjectsRepository();
    this.documentsRepo = new DocumentsRepository();
    this.llmClient = new LLMClient(llm);
  }

  /**
   * List question sets for user with pagination and filters
   * @param {string} userId
   * @param {object} options - { page, pageSize, sort, status, subjectId }
   * @returns {Promise<{items, meta}>}
   */
  async listByUser(userId, { page = 1, pageSize = 20, sort = '-createdAt', status, subjectId } = {}) {
    const sortObj = this._parseSortParam(sort);
    
    // Build filter
    const filter = { userId };
    if (status) filter.status = status;
    if (subjectId) filter.subjectId = subjectId;

    const { items, totalItems, totalPages } = await this.repo.paginate(filter, {
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
   * Generate new question set from subject content
   * @param {string} userId
   * @param {object} payload - { subjectId, title, numQuestions, difficulty, documentIds }
   * @returns {Promise<object>}
   */
  async generate(userId, payload) {
    const {
      subjectId,
      title,
      numQuestions = 10,
      difficulty = 'Hiểu',
      documentIds = [],
    } = payload;

    // Validation
    if (!subjectId || !title) {
      throw {
        code: 'ValidationError',
        message: 'subjectId and title are required',
        status: 400,
      };
    }

    if (numQuestions < 1 || numQuestions > 100) {
      throw {
        code: 'ValidationError',
        message: 'numQuestions must be between 1 and 100',
        status: 400,
      };
    }

    const validDifficulties = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'];
    if (!validDifficulties.includes(difficulty)) {
      throw {
        code: 'ValidationError',
        message: `difficulty must be one of: ${validDifficulties.join(', ')}`,
        status: 400,
      };
    }

    // Verify subject ownership
    const subject = await this.subjectsRepo.findByIdAndUser(subjectId, userId);
    if (!subject) {
      throw {
        code: 'NotFound',
        message: 'Subject not found or access denied',
        status: 404,
      };
    }

    // Build context from documents
    const contextText = await this._buildContextFromDocuments(
      userId,
      subjectId,
      documentIds,
      title
    );

    logger.info(
      {
        userId,
        subjectId,
        title,
        numQuestions,
        difficulty,
        contextLength: contextText.length,
      },
      '[QuestionSets] Generating questions'
    );

    // Check LLM mode
    const mode = process.env.LLM_MODE || 'stub';
    let questions = [];

    if (mode === 'stub' || !llm.apiKey) {
      // Stub mode: generate fake questions
      questions = this._generateStubQuestions(numQuestions, difficulty, title);
    } else {
      // Real mode: call LLM
      try {
        const result = await this.llmClient.generateQuestions({
          contextText,
          numQuestions,
          difficulty,
          topics: [],
        });

        questions = result.questions || [];

        // Validate LLM output
        questions = this._validateQuestions(questions, difficulty);

        if (questions.length === 0) {
          throw new Error('LLM returned no valid questions');
        }
      } catch (error) {
        logger.error(
          { userId, subjectId, error: error.message },
          '[QuestionSets] LLM generation failed'
        );
        throw {
          code: 'LLMError',
          message: 'Failed to generate questions via LLM',
          status: 503,
          details: { error: error.message },
        };
      }
    }

    // Create question set
    const questionSet = {
      userId,
      subjectId,
      title,
      status: 'Draft',
      isShared: false,
      questions,
    };

    const created = await this.repo.create(questionSet);

    logger.info(
      { questionSetId: created._id, questionCount: questions.length },
      '[QuestionSets] Question set created'
    );

    return mapId(created);
  }

  /**
   * Get question set by ID with ownership check
   * @param {string} userId
   * @param {string} questionSetId
   * @returns {Promise<object>}
   */
  async getById(userId, questionSetId) {
    const questionSet = await this.repo.findByIdAndUser(questionSetId, userId);
    if (!questionSet) {
      throw {
        code: 'NotFound',
        message: 'Question set not found or access denied',
        status: 404,
      };
    }
    return mapId(questionSet);
  }

  /**
   * Update question set with ownership check
   * @param {string} userId
   * @param {string} questionSetId
   * @param {object} payload - { title, status, questions }
   * @returns {Promise<object>}
   */
  async update(userId, questionSetId, payload) {
    const allowed = {};

    if (payload.title !== undefined) {
      if (!payload.title.trim()) {
        throw { code: 'ValidationError', message: 'title cannot be empty', status: 400 };
      }
      allowed.title = payload.title.trim();
    }

    if (payload.status !== undefined) {
      const validStatuses = [
        'Public',
        'PendingValidation',
        'InReview',
        'Validated',
        'Rejected',
        'Draft',
        'PendingApproval',
        'Published',
      ];
      if (!validStatuses.includes(payload.status)) {
        throw {
          code: 'ValidationError',
          message: `Invalid status: ${payload.status}`,
          status: 400,
        };
      }
      allowed.status = payload.status;
    }

    if (payload.questions !== undefined) {
      // Validate questions array
      if (!Array.isArray(payload.questions)) {
        throw { code: 'ValidationError', message: 'questions must be an array', status: 400 };
      }
      allowed.questions = payload.questions;
    }

    const updated = await this.repo.updateByIdAndUser(questionSetId, userId, allowed);
    if (!updated) {
      throw {
        code: 'NotFound',
        message: 'Question set not found or access denied',
        status: 404,
      };
    }

    return mapId(updated);
  }

  /**
   * Delete question set with ownership check
   * @param {string} userId
   * @param {string} questionSetId
   * @returns {Promise<void>}
   */
  async remove(userId, questionSetId) {
    const deleted = await this.repo.deleteByIdAndUser(questionSetId, userId);
    if (!deleted) {
      throw {
        code: 'NotFound',
        message: 'Question set not found or access denied',
        status: 404,
      };
    }
  }

  /**
   * Share question set - generate public URL
   * @param {string} userId
   * @param {string} questionSetId
   * @returns {Promise<object>}
   */
  async share(userId, questionSetId) {
    const questionSet = await this.repo.findByIdAndUser(questionSetId, userId);
    if (!questionSet) {
      throw {
        code: 'NotFound',
        message: 'Question set not found or access denied',
        status: 404,
      };
    }

    // Generate unique shared URL
    const sharedUrl = `share_${questionSetId}_${Date.now()}`;

    const updated = await this.repo.updateByIdAndUser(questionSetId, userId, {
      isShared: true,
      sharedUrl,
    });

    return mapId(updated);
  }

  // ===== PRIVATE HELPERS =====

  /**
   * Build context text from documents
   */
  async _buildContextFromDocuments(userId, subjectId, documentIds, title) {
    try {
      let docs = [];

      if (documentIds && documentIds.length > 0) {
        // Use specific documents
        for (const docId of documentIds.slice(0, 10)) {
          const doc = await this.documentsRepo.findByIdAndOwner(docId, userId);
          if (doc && doc.status === 'Completed') {
            docs.push(doc);
          }
        }
      } else {
        // Use all completed documents from subject
        const result = await this.documentsRepo.findBySubject(subjectId, {
          page: 1,
          pageSize: 10,
          sort: { uploadedAt: -1 },
        });
        docs = result.items.filter((d) => d.status === 'Completed');
      }

      if (docs.length === 0) {
        return `Topic: ${title}`;
      }

      // Build context from summaries or extracted text
      const parts = docs.map((doc) => {
        const header = `Document: ${doc.originalFileName || 'unknown'}`;
        const content = doc.summaryFull || doc.summaryShort || doc.extractedText || '';
        const truncated = content.slice(0, 3000); // Cap per document
        return `${header}\n${truncated}`;
      });

      const context = parts.join('\n\n---\n\n');
      return context.slice(0, 18000); // Overall cap for LLM
    } catch (error) {
      logger.warn(
        { userId, subjectId, error: error.message },
        '[QuestionSets] Failed to build context from documents'
      );
      return `Topic: ${title}`;
    }
  }

  /**
   * Generate stub questions for dev/testing
   */
  _generateStubQuestions(numQuestions, difficulty, title) {
    return Array.from({ length: numQuestions }, (_, i) => ({
      questionId: `q${Date.now()}_${i}`,
      questionText: `Câu ${i + 1}: ${title}`,
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswerIndex: Math.floor(Math.random() * 4),
      explanation: `Đáp án đúng cho câu ${i + 1}`,
      topicTags: [],
      difficultyLevel: difficulty,
    }));
  }

  /**
   * Validate and sanitize questions from LLM
   */
  _validateQuestions(questions, expectedDifficulty) {
    const validDifficulties = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'];

    return questions
      .filter((q) => {
        // Must have required fields
        if (!q.questionText || !Array.isArray(q.options) || q.correctAnswerIndex === undefined) {
          return false;
        }
        // Must have exactly 4 options
        if (q.options.length !== 4) {
          return false;
        }
        // correctAnswerIndex must be 0-3
        if (q.correctAnswerIndex < 0 || q.correctAnswerIndex > 3) {
          return false;
        }
        return true;
      })
      .map((q) => ({
        questionId: q.questionId || `q${Date.now()}_${Math.random()}`,
        questionText: q.questionText.trim(),
        options: q.options.map((opt) => String(opt).trim()),
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation || '',
        topicTags: Array.isArray(q.topicTags) ? q.topicTags : [],
        difficultyLevel: validDifficulties.includes(q.difficultyLevel)
          ? q.difficultyLevel
          : expectedDifficulty,
      }));
  }

  /**
   * Parse sort parameter
   */
  _parseSortParam(sortParam) {
    if (!sortParam || typeof sortParam !== 'string') {
      return { createdAt: -1 };
    }

    const order = sortParam.startsWith('-') ? -1 : 1;
    const field = sortParam.startsWith('-') ? sortParam.slice(1) : sortParam;

    const allowedFields = ['createdAt', 'updatedAt', 'title', 'status'];
    if (!allowedFields.includes(field)) {
      return { createdAt: -1 };
    }

    return { [field]: order };
  }
}

module.exports = QuestionSetsService;
