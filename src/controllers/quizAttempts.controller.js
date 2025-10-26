const QuizAttemptsRepository = require('../repositories/quizAttempts.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');

const attemptsRepo = new QuizAttemptsRepository();
const qsetRepo = new QuestionSetsRepository();

const weights = { 'Biết': 1, 'Hiểu': 1.25, 'Vận dụng': 1.5, 'Vận dụng cao': 2 };

module.exports = {
  // POST /quiz-attempts { setId }
  create: async (req, res, next) => {
    try {
      const user = req.user;
      const { setId } = req.body || {};
      if (!setId) return res.status(400).json({ code: 'ValidationError', message: 'setId required' });
      const start = new Date();
      const created = await attemptsRepo.create({ userId: user.id, setId, score: 0, userAnswers: [], isCompleted: false, startTime: start, endTime: start });
      return res.status(201).json({ id: String(created._id || created.id), ...created });
    } catch (e) { next(e); }
  },

  // POST /quiz-attempts/:id/submit { answers: [{questionId, selectedOptionIndex}] }
  submit: async (req, res, next) => {
    try {
      const user = req.user;
      const attemptId = req.params.id;
      const { answers } = req.body || {};
      const attempt = await attemptsRepo.findById(attemptId);
      if (!attempt || String(attempt.userId) !== String(user.id)) return res.status(404).json({ code: 'NotFound', message: 'Attempt not found' });
      const qset = await qsetRepo.findById(attempt.setId);
      if (!qset) return res.status(404).json({ code: 'NotFound', message: 'Question set not found' });
      const byId = new Map((qset.questions || []).map((q) => [q.questionId, q]));

      let total = 0;
      let max = 0;
      const userAnswers = (answers || []).map((a) => {
        const q = byId.get(a.questionId);
        if (!q) return { questionId: a.questionId, selectedOptionIndex: a.selectedOptionIndex, isCorrect: false };
        const w = weights[q.difficultyLevel] || 1;
        const correct = q.correctAnswerIndex === a.selectedOptionIndex;
        if (correct) total += 1 * w;
        max += 1 * w;
        return { questionId: a.questionId, selectedOptionIndex: a.selectedOptionIndex, isCorrect: correct };
      });
      const score = max > 0 ? Math.round((total / max) * 100) : 0;
      const end = new Date();
      const updated = await attemptsRepo.updateById(attemptId, { $set: { userAnswers, score, isCompleted: true, endTime: end } }, { new: true });
      return res.status(200).json({ id: String(updated._id || updated.id), ...updated });
    } catch (e) { next(e); }
  },
};
