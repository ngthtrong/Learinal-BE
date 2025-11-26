const QuestionSetsRepository = require("../repositories/questionSets.repository");
const DocumentsRepository = require("../repositories/documents.repository");
const SubjectsRepository = require("../repositories/subjects.repository");
const UsersRepository = require("../repositories/users.repository");
const { env, llm } = require("../config");
const LLMClient = require("../adapters/llmClient");

const repo = new QuestionSetsRepository();
const docRepo = new DocumentsRepository();
const subjectRepo = new SubjectsRepository();
const usersRepo = new UsersRepository();

function mapId(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

// Helper: Map Easy/Medium/Hard to Remember/Understand/Apply/Analyze
function mapDifficultyLevel(level) {
  const mapping = {
    Easy: "Remember",
    Medium: "Understand",
    Hard: "Apply",
  };
  return mapping[level] || level || "Understand";
}

module.exports = {
  // GET /question-sets
  list: async (req, res, next) => {
    try {
      const user = req.user;
      const page = Math.max(1, parseInt(req.query.page || "1", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || "20", 10)));
      const { items, totalItems, totalPages } = await repo.paginate(
        { userId: user.id },
        { page, pageSize, sort: { createdAt: -1 } }
      );
      res.status(200).json({
        items: (items || []).map(mapId),
        meta: { page, pageSize, total: totalItems, totalPages },
      });
    } catch (e) {
      next(e);
    }
  },

  // GET /subjects/:subjectId/question-sets
  listBySubject: async (req, res, next) => {
    try {
      const user = req.user;
      const { subjectId } = req.params;

      // Validate và parse pagination params
      const page = Math.max(1, parseInt(req.query.page || "1", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || "20", 10)));

      // Filter: chỉ lấy question sets của user hiện tại và subject được chỉ định
      const filter = {
        subjectId,
        userId: user.id,
      };

      // Optional status filter
      if (req.query.status) {
        filter.status = req.query.status;
      }

      // Optional isShared filter
      if (req.query.isShared !== undefined) {
        filter.isShared = req.query.isShared === "true";
      }

      const result = await repo.paginate(filter, {
        page,
        pageSize,
        sort: { createdAt: -1 },
      });

      return res.status(200).json({
        items: result.items.map(mapId),
        meta: {
          page: result.meta.page,
          pageSize: result.meta.pageSize,
          total: result.meta.totalItems,
          totalPages: result.meta.totalPages,
        },
      });
    } catch (e) {
      next(e);
    }
  },

  // POST /question-sets/generate (real: uses LLM when configured; else returns 503)
  generate: async (req, res, next) => {
    try {
      const user = req.user;
      const {
        subjectId,
        title,
        numQuestions = 10,
        difficulty = "Understand",
        difficultyDistribution = null, // { "Remember": 20, "Understand": 10, "Apply": 10, "Analyze": 10 }
        topicDistribution = null, // { "topic-id-1": 10, "topic-id-2": 20, ... }
      } = req.body || {};

      if (!subjectId || !title) {
        return res
          .status(400)
          .json({ code: "ValidationError", message: "subjectId and title are required" });
      }

      // Validate numQuestions or difficultyDistribution
      let totalQuestions = numQuestions;
      if (difficultyDistribution && typeof difficultyDistribution === "object") {
        totalQuestions = Object.values(difficultyDistribution).reduce(
          (sum, count) => sum + (count || 0),
          0
        );
        if (totalQuestions < 1 || totalQuestions > 100) {
          return res.status(400).json({
            code: "ValidationError",
            message: "Total questions from difficultyDistribution must be between 1 and 100",
          });
        }
      } else {
        if (numQuestions < 1 || numQuestions > 100) {
          return res
            .status(400)
            .json({ code: "ValidationError", message: "numQuestions must be between 1 and 100" });
        }
      }

      // Enforce real generation: require LLM configured
      const isReal =
        (process.env.LLM_MODE || env.llmMode) === "real" && llm.apiKey && llm.apiKey.length > 0;
      if (!isReal) {
        return res.status(503).json({
          code: "ServiceUnavailable",
          message:
            "LLM not configured for real generation. Set LLM_MODE=real and provide GEMINI_API_KEY.",
        });
      }

      // Create question set with Pending status
      const toCreate = {
        userId: user.id,
        subjectId,
        title,
        status: "Pending",
        isShared: false,
        questions: [],
      };
      const created = await repo.create(toCreate);

      // Track usage for subscription limit enforcement
      const { usageTrackingRepository } = req.app.locals;
      await usageTrackingRepository.trackAction(
        user.id,
        "question_set_generation",
        created._id.toString(),
        { subjectId, numQuestions: totalQuestions, difficulty }
      );

      // Enqueue question generation job
      const { enqueueQuestionsGenerate } = require("../adapters/queue");
      const logger = require("../utils/logger");

      const jobPayload = {
        questionSetId: created._id.toString(),
        userId: String(user.id),
        subjectId: String(subjectId),
        numQuestions: totalQuestions,
        difficulty,
        difficultyDistribution,
        topicDistribution,
      };

      logger.info({ jobPayload }, "[controller] enqueueing question generation");
      await enqueueQuestionsGenerate(jobPayload);
      logger.info(
        { questionSetId: created._id.toString() },
        "[controller] question generation enqueued"
      );

      return res.status(202).json({
        ...mapId(created),
        message: "Question set generation started. You will receive a notification when completed.",
      });
    } catch (e) {
      next(e);
    }
  },

  // GET /question-sets/:id
  get: async (req, res, next) => {
    try {
      const user = req.user;
      const item = await repo.findById(req.params.id);

      if (!item) {
        return res.status(404).json({ code: "NotFound", message: "Not found" });
      }

      const isOwner = String(item.userId) === String(user.id);
      const isPubliclyShared = item.isShared === true;

      // Allow access if user is owner
      if (isOwner) {
        return res.status(200).json(mapId(item));
      }

      // If not owner and not shared, deny access
      if (!isPubliclyShared) {
        return res.status(404).json({ code: "NotFound", message: "Not found" });
      }

      // If question set is Public (created by expert), check Premium subscription
      if (item.status === "Public" && !isOwner) {
        const ownerUser = await usersRepo.findById(item.userId);
        if (ownerUser && ownerUser.role === "Expert") {
          // Check if current user has Premium subscription
          const { subscriptionRepository } = req.app.locals;
          const hasPremium = await subscriptionRepository.hasActiveSubscription(user.id);
          
          if (!hasPremium) {
            // Allow viewing but restrict quiz access
            return res.status(200).json({
              ...mapId(item),
              _premiumRequired: true,
              _message: "Bạn cần nâng cấp lên gói Premium để làm bài tập này"
            });
          }
        }
      }

      res.status(200).json(mapId(item));
    } catch (e) {
      next(e);
    }
  },

  // PATCH /question-sets/:id
  update: async (req, res, next) => {
    try {
      const user = req.user;
      const allowed = {};
      ["title", "status", "isShared", "sharedUrl", "questions"].forEach((k) => {
        if (req.body[k] !== undefined) allowed[k] = req.body[k];
      });
      const updated = await repo.updateById(
        req.params.id,
        { $set: allowed },
        { new: true, runValidators: true }
      );
      if (!updated || String(updated.userId) !== String(user.id))
        return res.status(404).json({ code: "NotFound", message: "Not found" });
      res.status(200).json(mapId(updated));
    } catch (e) {
      next(e);
    }
  },

  // POST /question-sets/:id/share
  share: async (req, res, next) => {
    try {
      const user = req.user;
      const existing = await repo.findById(req.params.id);
      if (!existing || String(existing.userId) !== String(user.id))
        return res.status(404).json({ code: "NotFound", message: "Not found" });
      const sharedUrl = `share_${existing._id || existing.id}_${Date.now()}`;
      const updated = await repo.updateById(
        req.params.id,
        { $set: { isShared: true, sharedUrl } },
        { new: true }
      );
      res.status(200).json(mapId(updated));
    } catch (e) {
      next(e);
    }
  },

  // POST /question-sets/:id/unshare
  unshare: async (req, res, next) => {
    try {
      const user = req.user;
      const existing = await repo.findById(req.params.id);
      if (!existing || String(existing.userId) !== String(user.id))
        return res.status(404).json({ code: "NotFound", message: "Not found" });
      const updated = await repo.updateById(
        req.params.id,
        { $set: { isShared: false }, $unset: { sharedUrl: "" } },
        { new: true }
      );
      res.status(200).json(mapId(updated));
    } catch (e) {
      next(e);
    }
  },

  // DELETE /question-sets/:id
  remove: async (req, res, next) => {
    try {
      const user = req.user;
      const existing = await repo.findById(req.params.id);
      if (!existing || String(existing.userId) !== String(user.id))
        return res.status(404).json({ code: "NotFound", message: "Not found" });

      // Delete all quiz attempts for this question set
      const QuizAttemptsRepository = require("../repositories/quizAttempts.repository");
      const quizAttemptsRepo = new QuizAttemptsRepository();
      await quizAttemptsRepo.deleteMany({ setId: req.params.id });

      // Delete the question set
      await repo.deleteById(req.params.id);

      res.status(200).json({
        success: true,
        message: "Question set and all associated quiz attempts deleted successfully",
      });
    } catch (e) {
      next(e);
    }
  },

  // POST /question-sets/:id/review
  requestReview: async (req, res, next) => {
    try {
      const { id: setId } = req.params;
      const userId = req.user.id;

      // 1. Validate ownership
      const questionSet = await repo.findById(setId);
      if (!questionSet || questionSet.userId.toString() !== userId) {
        return res.status(404).json({
          code: "NotFound",
          message: "Question set not found",
        });
      }

      // 2. Check if already has pending/assigned validation request
      const ValidationRequestsRepository = require("../repositories/validationRequests.repository");
      const validationRequestsRepo = new ValidationRequestsRepository();

      const existingRequest = await validationRequestsRepo.findOne({
        setId,
        status: { $in: ["PendingAssignment", "Assigned"] },
      });

      if (existingRequest) {
        return res.status(409).json({
          code: "Conflict",
          message: "Validation request already exists for this question set",
          details: {
            requestId: existingRequest._id.toString(),
            status: existingRequest.status,
          },
        });
      }

      // 3. Create validation request
      const validationRequest = await validationRequestsRepo.create({
        setId,
        learnerId: userId,
        status: "PendingAssignment",
        requestTime: new Date(),
      });

      // Track usage for subscription limit enforcement
      const { usageTrackingRepository } = req.app.locals;
      await usageTrackingRepository.trackAction(
        userId,
        "validation_request",
        validationRequest._id.toString(),
        { setId }
      );

      // 4. Enqueue assignment job
      const { enqueueEmail } = require("../adapters/queue");
      // Note: We'll use email queue temporarily until we have dedicated validation queue
      await enqueueEmail({
        type: "validation.requested",
        requestId: validationRequest._id.toString(),
        setId,
        learnerId: userId,
      });

      res.status(202).json({
        id: validationRequest._id.toString(),
        setId,
        status: "PendingAssignment",
        requestTime: validationRequest.requestTime,
        message: "Validation request submitted. An expert will be assigned shortly.",
      });
    } catch (e) {
      next(e);
    }
  },

  // POST /question-sets/create - Create question set manually (for Expert or Learner)
  createManual: async (req, res, next) => {
    try {
      const user = req.user;
      const { title, description, questions, subjectId } = req.body;

      if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({
          code: "ValidationError",
          message: "title and questions array are required",
        });
      }

      // Validate questions format
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.questionText || !q.options || q.options.length < 2) {
          return res.status(400).json({
            code: "ValidationError",
            message: `Question ${i + 1}: must have questionText and at least 2 options`,
          });
        }
        if (q.correctAnswerIndex === undefined || q.correctAnswerIndex < 0 || q.correctAnswerIndex >= q.options.length) {
          return res.status(400).json({
            code: "ValidationError",
            message: `Question ${i + 1}: correctAnswerIndex is invalid`,
          });
        }
      }

      // Generate questionId for each question and map difficulty
      const processedQuestions = questions.map((q, idx) => ({
        ...q,
        questionId: q.questionId || `q_${Date.now()}_${idx}`,
        difficultyLevel: mapDifficultyLevel(q.difficultyLevel),
      }));

      const toCreate = {
        userId: user.id,
        title,
        description: description || undefined,
        subjectId: subjectId || undefined,
        status: "Draft",
        isShared: false,
        questions: processedQuestions,
        questionCount: processedQuestions.length,
      };

      const created = await repo.create(toCreate);

      return res.status(201).json(mapId(created));
    } catch (e) {
      next(e);
    }
  },

  // POST /question-sets/generate-from-document - Generate from uploaded document
  generateFromDocument: async (req, res, next) => {
    try {
      const user = req.user;
      const {
        documentId,
        title,
        description,
        numQuestions = 10,
        difficulty = "Medium",
        questionType = "multiple-choice",
      } = req.body;

      if (!documentId || !title) {
        return res.status(400).json({
          code: "ValidationError",
          message: "documentId and title are required",
        });
      }

      // Verify document exists and belongs to user
      const document = await docRepo.findById(documentId);
      if (!document || String(document.userId) !== String(user.id)) {
        return res.status(404).json({
          code: "NotFound",
          message: "Document not found or access denied",
        });
      }

      if (document.ingestionStatus !== "Completed") {
        return res.status(400).json({
          code: "InvalidState",
          message: "Document ingestion not completed",
        });
      }

      // Enforce real generation: require LLM configured
      const isReal =
        (process.env.LLM_MODE || env.llmMode) === "real" && llm.apiKey && llm.apiKey.length > 0;
      if (!isReal) {
        return res.status(503).json({
          code: "ServiceUnavailable",
          message: "LLM not configured. Set LLM_MODE=real and provide GEMINI_API_KEY.",
        });
      }

      // Create question set with Processing status
      const toCreate = {
        userId: user.id,
        title,
        description: description || undefined,
        documentId,
        status: "Processing",
        isShared: false,
        questions: [],
      };
      const created = await repo.create(toCreate);

      // Enqueue question generation from document
      const { enqueueQuestionsGenerateFromDocument } = require("../adapters/queue");
      const logger = require("../utils/logger");

      const jobPayload = {
        questionSetId: created._id.toString(),
        userId: String(user.id),
        documentId: String(documentId),
        numQuestions,
        difficulty,
        questionType,
      };

      logger.info({ jobPayload }, "[controller] enqueueing question generation from document");
      await enqueueQuestionsGenerateFromDocument(jobPayload);
      logger.info(
        { questionSetId: created._id.toString() },
        "[controller] question generation from document enqueued"
      );

      return res.status(202).json({
        ...mapId(created),
        message: "Question set generation started. You will receive a notification when completed.",
      });
    } catch (e) {
      next(e);
    }
  },
};
