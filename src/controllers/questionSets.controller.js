const QuestionSetsRepository = require("../repositories/questionSets.repository");
const DocumentsRepository = require("../repositories/documents.repository");
const SubjectsRepository = require("../repositories/subjects.repository");
const { env, llm } = require("../config");
const LLMClient = require("../adapters/llmClient");

const repo = new QuestionSetsRepository();
const docRepo = new DocumentsRepository();
const subjectRepo = new SubjectsRepository();

function mapId(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
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
      if (!item || String(item.userId) !== String(user.id))
        return res.status(404).json({ code: "NotFound", message: "Not found" });
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
};
