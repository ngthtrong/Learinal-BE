/**
 * Unit tests for QuizAttemptsService
 * Focus on weighted scoring algorithm
 */

const QuizAttemptsService = require('../../../src/services/quizAttempts.service');

jest.mock('../../../src/repositories/quizAttempts.repository');
jest.mock('../../../src/repositories/questionSets.repository');
jest.mock('../../../src/repositories/commissionRecords.repository');

const QuizAttemptsRepository = require('../../../src/repositories/quizAttempts.repository');
const QuestionSetsRepository = require('../../../src/repositories/questionSets.repository');

describe('QuizAttemptsService', () => {
  let service;
  let mockAttemptsRepo;
  let mockQuestionSetsRepo;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAttemptsRepo = new QuizAttemptsRepository();
    mockQuestionSetsRepo = new QuestionSetsRepository();

    service = new QuizAttemptsService();
    service.repo = mockAttemptsRepo;
    service.questionSetsRepo = mockQuestionSetsRepo;
  });

  describe('startAttempt', () => {
    const userId = 'user123';
    const setId = 'set456';

    it('should create new quiz attempt with questions', async () => {
      const mockQuestionSet = {
        _id: setId,
        title: 'Math Quiz',
        questions: [
          {
            questionId: 'q1',
            questionText: 'What is 2+2?',
            options: ['1', '2', '3', '4'],
            correctAnswerIndex: 3,
            difficultyLevel: 'Biết',
          },
          {
            questionId: 'q2',
            questionText: 'What is 5*5?',
            options: ['20', '25', '30', '35'],
            correctAnswerIndex: 1,
            difficultyLevel: 'Hiểu',
          },
        ],
      };

      mockQuestionSetsRepo.findById.mockResolvedValue(mockQuestionSet);
      mockAttemptsRepo.create.mockResolvedValue({
        _id: 'attempt123',
        userId,
        setId,
        score: 0,
        isCompleted: false,
        startTime: new Date(),
      });

      const result = await service.startAttempt(userId, setId);

      expect(result.questions).toHaveLength(2);
      expect(result.questions[0]).not.toHaveProperty('correctAnswerIndex');
      expect(result.questions[0]).toHaveProperty('questionText');
      expect(result.questions[0]).toHaveProperty('options');
      expect(result.questions[0]).toHaveProperty('difficultyLevel');
    });

    it('should throw NotFound if question set does not exist', async () => {
      mockQuestionSetsRepo.findById.mockResolvedValue(null);

      await expect(service.startAttempt(userId, setId)).rejects.toMatchObject({
        code: 'NotFound',
        status: 404,
      });
    });

    it('should throw ValidationError if question set has no questions', async () => {
      mockQuestionSetsRepo.findById.mockResolvedValue({
        _id: setId,
        questions: [],
      });

      await expect(service.startAttempt(userId, setId)).rejects.toMatchObject({
        code: 'ValidationError',
        status: 400,
      });
    });
  });

  describe('submitAttempt - Weighted Scoring Algorithm', () => {
    const userId = 'user123';
    const attemptId = 'attempt456';

    it('should calculate weighted score correctly with mixed difficulties', async () => {
      // Mock attempt (not completed)
      mockAttemptsRepo.findByIdAndUser.mockResolvedValue({
        _id: attemptId,
        userId,
        setId: 'set123',
        isCompleted: false,
      });

      // Mock question set with different difficulty levels
      mockQuestionSetsRepo.findById.mockResolvedValue({
        _id: 'set123',
        questions: [
          {
            questionId: 'q1',
            questionText: 'Easy question',
            correctAnswerIndex: 0,
            difficultyLevel: 'Biết', // Weight: 1.0
          },
          {
            questionId: 'q2',
            questionText: 'Medium question',
            correctAnswerIndex: 1,
            difficultyLevel: 'Hiểu', // Weight: 1.5
          },
          {
            questionId: 'q3',
            questionText: 'Hard question',
            correctAnswerIndex: 2,
            difficultyLevel: 'Vận dụng', // Weight: 2.0
          },
          {
            questionId: 'q4',
            questionText: 'Very hard question',
            correctAnswerIndex: 3,
            difficultyLevel: 'Vận dụng cao', // Weight: 2.5
          },
        ],
      });

      // User answers: 2 correct (Biết + Hiểu), 2 incorrect
      const answers = [
        { questionId: 'q1', selectedOptionIndex: 0 }, // Correct: 1.0
        { questionId: 'q2', selectedOptionIndex: 1 }, // Correct: 1.5
        { questionId: 'q3', selectedOptionIndex: 0 }, // Incorrect: 0
        { questionId: 'q4', selectedOptionIndex: 0 }, // Incorrect: 0
      ];

      mockAttemptsRepo.updateById.mockResolvedValue({
        _id: attemptId,
        score: 36, // (1.0 + 1.5) / (1.0 + 1.5 + 2.0 + 2.5) * 100 = 35.71 ≈ 36
        isCompleted: true,
      });

      const result = await service.submitAttempt(userId, attemptId, { answers });

      // Verify score calculation
      // Total weight earned: 1.0 + 1.5 = 2.5
      // Total possible weight: 1.0 + 1.5 + 2.0 + 2.5 = 7.0
      // Score: (2.5 / 7.0) * 100 = 35.71 ≈ 36
      expect(result.score).toBe(36);
      expect(result.isCompleted).toBe(true);

      expect(result.summary).toMatchObject({
        correctCount: 2,
        totalQuestions: 4,
      });
    });

    it('should score 100% when all answers are correct', async () => {
      mockAttemptsRepo.findByIdAndUser.mockResolvedValue({
        _id: attemptId,
        userId,
        setId: 'set123',
        isCompleted: false,
      });

      mockQuestionSetsRepo.findById.mockResolvedValue({
        _id: 'set123',
        questions: [
          {
            questionId: 'q1',
            correctAnswerIndex: 0,
            difficultyLevel: 'Biết',
          },
          {
            questionId: 'q2',
            correctAnswerIndex: 1,
            difficultyLevel: 'Vận dụng cao',
          },
        ],
      });

      const answers = [
        { questionId: 'q1', selectedOptionIndex: 0 }, // Correct
        { questionId: 'q2', selectedOptionIndex: 1 }, // Correct
      ];

      mockAttemptsRepo.updateById.mockResolvedValue({
        _id: attemptId,
        score: 100,
        isCompleted: true,
      });

      const result = await service.submitAttempt(userId, attemptId, { answers });

      expect(result.score).toBe(100);
      expect(result.summary.correctCount).toBe(2);
    });

    it('should score 0% when all answers are incorrect', async () => {
      mockAttemptsRepo.findByIdAndUser.mockResolvedValue({
        _id: attemptId,
        userId,
        setId: 'set123',
        isCompleted: false,
      });

      mockQuestionSetsRepo.findById.mockResolvedValue({
        _id: 'set123',
        questions: [
          { questionId: 'q1', correctAnswerIndex: 0, difficultyLevel: 'Biết' },
          { questionId: 'q2', correctAnswerIndex: 1, difficultyLevel: 'Hiểu' },
        ],
      });

      const answers = [
        { questionId: 'q1', selectedOptionIndex: 1 }, // Incorrect
        { questionId: 'q2', selectedOptionIndex: 0 }, // Incorrect
      ];

      mockAttemptsRepo.updateById.mockResolvedValue({
        _id: attemptId,
        score: 0,
        isCompleted: true,
      });

      const result = await service.submitAttempt(userId, attemptId, { answers });

      expect(result.score).toBe(0);
      expect(result.summary.correctCount).toBe(0);
    });

    it('should throw ValidationError if attempt already completed', async () => {
      mockAttemptsRepo.findByIdAndUser.mockResolvedValue({
        _id: attemptId,
        userId,
        isCompleted: true, // Already completed
      });

      await expect(
        service.submitAttempt(userId, attemptId, { 
          answers: [{ questionId: 'q1', selectedAnswer: 0 }] 
        })
      ).rejects.toMatchObject({
        code: 'ValidationError',
        message: 'Quiz attempt already completed',
        status: 400,
      });
    });

    it('should throw ValidationError if answers array is empty', async () => {
      await expect(
        service.submitAttempt(userId, attemptId, { answers: [] })
      ).rejects.toMatchObject({
        code: 'ValidationError',
        status: 400,
      });
    });
  });

  describe('getById', () => {
    const userId = 'user123';
    const attemptId = 'attempt456';

    it('should return attempt with detailed results if completed', async () => {
      const mockAttempt = {
        _id: attemptId,
        userId,
        setId: 'set123',
        isCompleted: true,
        score: 80,
        userAnswers: [
          { questionId: 'q1', selectedOptionIndex: 0, isCorrect: true },
        ],
      };

      mockAttemptsRepo.findByIdAndUser.mockResolvedValue(mockAttempt);
      mockQuestionSetsRepo.findById.mockResolvedValue({
        _id: 'set123',
        questions: [
          {
            questionId: 'q1',
            questionText: 'Test?',
            options: ['A', 'B', 'C', 'D'],
            correctAnswerIndex: 0,
            explanation: 'Explanation',
            difficultyLevel: 'Biết',
          },
        ],
      });

      const result = await service.getById(userId, attemptId);

      expect(result.score).toBe(80);
      expect(result.detailedResults).toBeDefined();
      expect(result.detailedResults[0]).toHaveProperty('explanation');
    });

    it('should throw NotFound if attempt not found or wrong user', async () => {
      mockAttemptsRepo.findByIdAndUser.mockResolvedValue(null);

      await expect(service.getById(userId, attemptId)).rejects.toMatchObject({
        code: 'NotFound',
        status: 404,
      });
    });
  });
});
