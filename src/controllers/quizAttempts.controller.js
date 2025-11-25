const QuizAttemptsRepository = require("../repositories/quizAttempts.repository");
const QuestionSetsRepository = require("../repositories/questionSets.repository");
const notificationService = require("../services/notification.service");

const attemptsRepo = new QuizAttemptsRepository();
const qsetRepo = new QuestionSetsRepository();

const weights = { Biết: 1, Hiểu: 1.25, "Vận dụng": 1.5, "Vận dụng cao": 2 };

module.exports = {
  // POST /quiz-attempts { setId }
  create: async (req, res, next) => {
    try {
      const user = req.user;
      const { setId, isTimed = true } = req.body || {};
      if (!setId)
        return res.status(400).json({ code: "ValidationError", message: "setId required" });
      
      const start = isTimed ? new Date() : null;
      const created = await attemptsRepo.create({
        userId: user.id,
        setId,
        score: 0,
        userAnswers: [],
        isCompleted: false,
        isTimed,
        startTime: start,
        endTime: start,
      });
      return res.status(201).json({ id: String(created._id || created.id), ...created });
    } catch (e) {
      next(e);
    }
  },

  // GET /quiz-attempts/:id
  get: async (req, res, next) => {
    try {
      const user = req.user;
      const attempt = await attemptsRepo.findById(req.params.id);
      if (!attempt || String(attempt.userId) !== String(user.id)) {
        return res.status(404).json({ code: "NotFound", message: "Quiz attempt not found" });
      }

      // Populate question set with questions for result display
      const qset = await qsetRepo.findById(attempt.setId);
      const result = {
        id: String(attempt._id || attempt.id),
        ...attempt,
        questionSet: qset
          ? {
              id: String(qset._id || qset.id),
              title: qset.title,
              questions: qset.questions || [],
              questionCount: qset.questionCount || (qset.questions || []).length,
            }
          : null,
      };

      return res.status(200).json(result);
    } catch (e) {
      next(e);
    }
  },

  // GET /question-sets/:questionSetId/quiz-attempts
  listByQuestionSet: async (req, res, next) => {
    try {
      const user = req.user;
      const { questionSetId } = req.params;

      // Validate và parse pagination params
      const page = Math.max(1, parseInt(req.query.page || "1", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || "20", 10)));

      // Filter: chỉ lấy quiz attempts của user hiện tại và question set được chỉ định
      const filter = {
        setId: questionSetId,
        userId: user.id,
      };

      // Optional isCompleted filter
      if (req.query.isCompleted !== undefined) {
        filter.isCompleted = req.query.isCompleted === "true";
      }

      const result = await attemptsRepo.paginate(filter, {
        page,
        pageSize,
        sort: { endTime: -1 },
      });

      return res.status(200).json({
        items: result.items.map((item) => ({
          id: String(item._id || item.id),
          ...item,
          startedAt: item.startTime,     // Map for frontend compatibility
          completedAt: item.isCompleted ? item.endTime : null,  // Only set if completed
        })),
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

  // POST /quiz-attempts/:id/submit { answers: [{questionId, selectedOptionIndex}] }
  submit: async (req, res, next) => {
    try {
      const user = req.user;
      const attemptId = req.params.id;
      const { answers } = req.body || {};
      
      console.log('=== QUIZ SUBMIT DEBUG ===');
      console.log('Received answers:', JSON.stringify(answers, null, 2));
      
      const attempt = await attemptsRepo.findById(attemptId);
      if (!attempt || String(attempt.userId) !== String(user.id))
        return res.status(404).json({ code: "NotFound", message: "Attempt not found" });
      const qset = await qsetRepo.findById(attempt.setId);
      if (!qset)
        return res.status(404).json({ code: "NotFound", message: "Question set not found" });
      
      console.log('Question set questions count:', qset.questions?.length);
      console.log('Question IDs in set:', (qset.questions || []).map(q => q.questionId));
      
      const byId = new Map((qset.questions || []).map((q) => [q.questionId, q]));
      console.log('Map keys:', Array.from(byId.keys()));

      // Calculate max score from ALL questions in the set
      let totalScore = 0;
      let maxScore = 0;
      
      // First, calculate max score from ALL questions
      (qset.questions || []).forEach((q) => {
        const w = weights[q.difficultyLevel] || 1;
        maxScore += 1 * w;
      });
      
      // Then process user answers and calculate their score
      const userAnswers = (answers || []).map((a) => {
        const q = byId.get(a.questionId);
        console.log(`Matching questionId ${a.questionId}:`, q ? 'FOUND' : 'NOT FOUND');
        if (!q)
          return {
            questionId: a.questionId,
            selectedOptionIndex: a.selectedOptionIndex,
            isCorrect: false,
          };
        const w = weights[q.difficultyLevel] || 1;
        const correct = q.correctAnswerIndex === a.selectedOptionIndex;
        if (correct) totalScore += 1 * w;
        return {
          questionId: a.questionId,
          selectedOptionIndex: a.selectedOptionIndex,
          isCorrect: correct,
        };
      });
      
      console.log('Final userAnswers:', JSON.stringify(userAnswers, null, 2));
      console.log('Score calculation: totalScore =', totalScore, ', maxScore =', maxScore);
      
      const score = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

      const end = (attempt.isTimed !== false) ? new Date() : null;
      const updated = await attemptsRepo.updateById(
        attemptId,
        { $set: { userAnswers, score, isCompleted: true, endTime: end } },
        { new: true }
      );

      console.log('Updated attempt:', updated ? 'SUCCESS' : 'FAILED');
      console.log('=== END DEBUG ===');

      // Emit real-time notification for quiz completion
      notificationService.emitQuizCompleted(user.id, {
        _id: updated._id || updated.id,
        questionSet: attempt.setId,
        score,
        totalQuestions: (qset.questions || []).length,
        completedAt: end,
      });

      return res.status(200).json({ id: String(updated._id || updated.id), ...updated });
    } catch (e) {
      console.error('Quiz submit error:', e);
      next(e);
    }
  },
};
