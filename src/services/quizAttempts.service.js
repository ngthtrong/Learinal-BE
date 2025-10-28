const QuizAttemptsRepository = require('../repositories/quizAttempts.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const CommissionRecordsRepository = require('../repositories/commissionRecords.repository');
const logger = require('../utils/logger');

/**
 * Difficulty level weights for scoring
 * Higher difficulty = higher weight = more points
 */
const DIFFICULTY_WEIGHTS = {
  'Biết': 1.0,
  'Hiểu': 1.5,
  'Vận dụng': 2.0,
  'Vận dụng cao': 2.5,
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
 * QuizAttemptsService - Business logic for quiz attempts and scoring
 * Handles starting quiz, submitting answers, calculating scores with difficulty weights
 */
class QuizAttemptsService {
  constructor() {
    this.repo = new QuizAttemptsRepository();
    this.questionSetsRepo = new QuestionSetsRepository();
    this.commissionRepo = new CommissionRecordsRepository();
  }

  /**
   * Start a new quiz attempt
   * @param {string} userId
   * @param {string} setId
   * @returns {Promise<object>} - Quiz attempt with questions (without correct answers)
   */
  async startAttempt(userId, setId) {
    // Fetch question set
    const questionSet = await this.questionSetsRepo.findById(setId);
    if (!questionSet) {
      throw {
        code: 'NotFound',
        message: 'Question set not found',
        status: 404,
      };
    }

    // Validate question set has questions
    if (!questionSet.questions || questionSet.questions.length === 0) {
      throw {
        code: 'ValidationError',
        message: 'Question set has no questions',
        status: 400,
      };
    }

    // Create quiz attempt (not yet completed)
    const attempt = {
      userId,
      setId,
      score: 0,
      userAnswers: [],
      isCompleted: false,
      startTime: new Date(),
      endTime: new Date(), // Will be updated on submit
    };

    const created = await this.repo.create(attempt);

    logger.info(
      { attemptId: created._id, userId, setId },
      '[QuizAttempts] Quiz attempt started'
    );

    // Return attempt with questions (hide correct answers)
    const sanitizedQuestions = questionSet.questions.map((q) => ({
      questionId: q.questionId,
      questionText: q.questionText,
      options: q.options,
      difficultyLevel: q.difficultyLevel,
      // Don't expose correctAnswerIndex or explanation yet
    }));

    return {
      ...mapId(created),
      questions: sanitizedQuestions,
      questionSetTitle: questionSet.title,
    };
  }

  /**
   * Submit quiz answers and calculate score
   * @param {string} userId
   * @param {string} attemptId
   * @param {object} payload - { answers: [{ questionId, selectedOptionIndex }] }
   * @returns {Promise<object>} - Completed attempt with score and detailed results
   */
  async submitAttempt(userId, attemptId, payload) {
    const { answers } = payload;

    if (!Array.isArray(answers) || answers.length === 0) {
      throw {
        code: 'ValidationError',
        message: 'answers array is required and must not be empty',
        status: 400,
      };
    }

    // Fetch attempt with ownership check
    const attempt = await this.repo.findByIdAndUser(attemptId, userId);
    if (!attempt) {
      throw {
        code: 'NotFound',
        message: 'Quiz attempt not found or access denied',
        status: 404,
      };
    }

    // Check if already completed
    if (attempt.isCompleted) {
      throw {
        code: 'ValidationError',
        message: 'Quiz attempt already completed',
        status: 400,
      };
    }

    // Fetch question set for answer validation
    const questionSet = await this.questionSetsRepo.findById(attempt.setId);
    if (!questionSet) {
      throw {
        code: 'NotFound',
        message: 'Question set not found',
        status: 404,
      };
    }

    // Calculate score
    const { userAnswers, totalScore, maxPossibleScore } = this._calculateScore(
      answers,
      questionSet.questions
    );

    // Normalize score to 0-100 range
    const normalizedScore = maxPossibleScore > 0
      ? Math.round((totalScore / maxPossibleScore) * 100)
      : 0;

    // Update attempt
    const updated = await this.repo.updateById(attemptId, {
      $set: {
        userAnswers,
        score: normalizedScore,
        isCompleted: true,
        endTime: new Date(),
      },
    });

    logger.info(
      {
        attemptId,
        userId,
        setId: attempt.setId,
        score: normalizedScore,
        correctCount: userAnswers.filter((a) => a.isCorrect).length,
        totalCount: userAnswers.length,
      },
      '[QuizAttempts] Quiz attempt completed'
    );

    // Trigger commission record if needed
    await this._triggerCommission(userId, attempt.setId, questionSet);

    // Return detailed results with explanations
    const detailedResults = this._buildDetailedResults(userAnswers, questionSet.questions);

    return {
      ...mapId(updated),
      detailedResults,
      summary: {
        score: normalizedScore,
        correctCount: userAnswers.filter((a) => a.isCorrect).length,
        totalQuestions: userAnswers.length,
        maxPossibleScore,
        earnedScore: totalScore,
      },
    };
  }

  /**
   * Get quiz attempt by ID with ownership check
   * @param {string} userId
   * @param {string} attemptId
   * @returns {Promise<object>}
   */
  async getById(userId, attemptId) {
    const attempt = await this.repo.findByIdAndUser(attemptId, userId);
    if (!attempt) {
      throw {
        code: 'NotFound',
        message: 'Quiz attempt not found or access denied',
        status: 404,
      };
    }

    // If completed, enrich with question details
    if (attempt.isCompleted) {
      const questionSet = await this.questionSetsRepo.findById(attempt.setId);
      if (questionSet) {
        const detailedResults = this._buildDetailedResults(
          attempt.userAnswers,
          questionSet.questions
        );
        return {
          ...mapId(attempt),
          detailedResults,
        };
      }
    }

    return mapId(attempt);
  }

  /**
   * List quiz attempts for user with pagination
   * @param {string} userId
   * @param {object} options - { page, pageSize, sort, setId }
   * @returns {Promise<{items, meta}>}
   */
  async listByUser(userId, { page = 1, pageSize = 20, sort = '-endTime', setId } = {}) {
    const sortObj = this._parseSortParam(sort);
    const filter = { userId };
    if (setId) filter.setId = setId;

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

  // ===== PRIVATE HELPERS =====

  /**
   * Calculate score with difficulty weights
   * @private
   */
  _calculateScore(userAnswers, questions) {
    const questionsMap = new Map(questions.map((q) => [q.questionId, q]));
    const results = [];
    let totalScore = 0;
    let maxPossibleScore = 0;

    for (const answer of userAnswers) {
      const question = questionsMap.get(answer.questionId);

      if (!question) {
        // Question not found - skip
        continue;
      }

      const weight = DIFFICULTY_WEIGHTS[question.difficultyLevel] || 1.0;
      maxPossibleScore += weight;

      const isCorrect = answer.selectedOptionIndex === question.correctAnswerIndex;

      if (isCorrect) {
        totalScore += weight;
      }

      results.push({
        questionId: answer.questionId,
        selectedOptionIndex: answer.selectedOptionIndex,
        isCorrect,
      });
    }

    return {
      userAnswers: results,
      totalScore,
      maxPossibleScore,
    };
  }

  /**
   * Build detailed results with explanations
   * @private
   */
  _buildDetailedResults(userAnswers, questions) {
    const questionsMap = new Map(questions.map((q) => [q.questionId, q]));

    return userAnswers.map((answer) => {
      const question = questionsMap.get(answer.questionId);

      if (!question) {
        return {
          questionId: answer.questionId,
          selectedOptionIndex: answer.selectedOptionIndex,
          isCorrect: answer.isCorrect,
        };
      }

      return {
        questionId: answer.questionId,
        questionText: question.questionText,
        options: question.options,
        selectedOptionIndex: answer.selectedOptionIndex,
        correctAnswerIndex: question.correctAnswerIndex,
        isCorrect: answer.isCorrect,
        explanation: question.explanation || '',
        difficultyLevel: question.difficultyLevel,
        weight: DIFFICULTY_WEIGHTS[question.difficultyLevel] || 1.0,
      };
    });
  }

  /**
   * Trigger commission record for validated question sets
   * @private
   */
  async _triggerCommission(userId, setId, questionSet) {
    try {
      // Only create commission for validated sets
      if (questionSet.status !== 'Validated' && questionSet.status !== 'Published') {
        return;
      }

      // Check if commission already exists for this set and user (avoid duplicates)
      const existingCommissions = await this.commissionRepo.findMany({
        setId,
        // Note: We might want to track per-attempt commissions, but for now check if any exists
      });

      if (existingCommissions && existingCommissions.length > 0) {
        logger.debug({ setId, userId }, '[QuizAttempts] Commission already exists for this set');
        return;
      }

      // Create commission record (will be processed by admin/finance)
      // Note: Actual commission logic depends on business rules
      // This is a placeholder - actual implementation needed
      logger.info(
        { userId, setId, questionSetOwner: questionSet.userId },
        '[QuizAttempts] Commission trigger - placeholder'
      );

      // TODO: Implement commission creation
      // await this.commissionRepo.create({
      //   expertId: questionSet.userId, // The expert who created the question set
      //   setId,
      //   amount: calculateCommissionAmount(), // Based on business rules
      //   status: 'Pending',
      //   transactionDate: new Date(),
      // });

    } catch (error) {
      logger.error(
        { userId, setId, error: error.message },
        '[QuizAttempts] Failed to trigger commission'
      );
      // Non-fatal - don't block quiz completion
    }
  }

  /**
   * Parse sort parameter
   * @private
   */
  _parseSortParam(sortParam) {
    if (!sortParam || typeof sortParam !== 'string') {
      return { endTime: -1 };
    }

    const order = sortParam.startsWith('-') ? -1 : 1;
    const field = sortParam.startsWith('-') ? sortParam.slice(1) : sortParam;

    const allowedFields = ['endTime', 'startTime', 'score', 'createdAt'];
    if (!allowedFields.includes(field)) {
      return { endTime: -1 };
    }

    return { [field]: order };
  }
}

module.exports = QuizAttemptsService;
