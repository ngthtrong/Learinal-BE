/**
 * Unit tests for QuestionSetsService
 * Tests business logic without actual database/external dependencies
 */

const QuestionSetsService = require('../../../src/services/questionSets.service');

// Mock dependencies
jest.mock('../../../src/repositories/questionSets.repository');
jest.mock('../../../src/repositories/subjects.repository');
jest.mock('../../../src/repositories/documents.repository');
jest.mock('../../../src/adapters/llmClient');

const QuestionSetsRepository = require('../../../src/repositories/questionSets.repository');
const SubjectsRepository = require('../../../src/repositories/subjects.repository');
const DocumentsRepository = require('../../../src/repositories/documents.repository');
const LLMClient = require('../../../src/adapters/llmClient');

describe('QuestionSetsService', () => {
  let service;
  let mockQuestionSetsRepo;
  let mockSubjectsRepo;
  let mockDocumentsRepo;
  let mockLLMClient;
  let originalLLMMode;

  beforeEach(() => {
    // Save original LLM_MODE
    originalLLMMode = process.env.LLM_MODE;
    // Set to 'real' for testing LLM logic
    process.env.LLM_MODE = 'real';

    // Reset all mocks before each test
    jest.clearAllMocks();

    // Create mock instances
    mockQuestionSetsRepo = new QuestionSetsRepository();
    mockSubjectsRepo = new SubjectsRepository();
    mockDocumentsRepo = new DocumentsRepository();
    mockLLMClient = {
      generateQuestions: jest.fn(),
    };

    // Mock LLMClient constructor to return our mock
    LLMClient.mockImplementation(() => mockLLMClient);

    // Inject mocks into service
    service = new QuestionSetsService();
    service.repo = mockQuestionSetsRepo;
    service.subjectsRepo = mockSubjectsRepo;
    service.documentsRepo = mockDocumentsRepo;
  });

  afterEach(() => {
    // Restore original LLM_MODE
    process.env.LLM_MODE = originalLLMMode;
  });

  describe('generate', () => {
    const userId = 'user123';
    const payload = {
      subjectId: 'subject456',
      title: 'Test Question Set',
      numQuestions: 5,
      difficulty: 'Hiểu',
    };

    it('should validate numQuestions range (1-100)', async () => {
      const invalidPayload = { ...payload, numQuestions: 150 };

      await expect(service.generate(userId, invalidPayload)).rejects.toMatchObject({
        code: 'ValidationError',
        status: 400,
      });
    });

    it('should verify subject ownership before generating', async () => {
      mockSubjectsRepo.findByIdAndUser.mockResolvedValue(null);

      await expect(service.generate(userId, payload)).rejects.toMatchObject({
        code: 'NotFound',
        message: 'Subject not found or access denied',
        status: 404,
      });

      expect(mockSubjectsRepo.findByIdAndUser).toHaveBeenCalledWith(
        payload.subjectId,
        userId
      );
    });

    it('should create question set with Draft status when LLM succeeds', async () => {
      // Mock subject exists
      mockSubjectsRepo.findByIdAndUser.mockResolvedValue({
        _id: payload.subjectId,
        userId,
        subjectName: 'Math',
      });

      // Mock documents for context
      mockDocumentsRepo.findBySubject.mockResolvedValue([
        {
          _id: 'doc1',
          extractedText: 'Sample extracted text for context',
          summaryShort: 'Summary of document',
        },
      ]);

      // Mock LLM success
      mockLLMClient.generateQuestions.mockResolvedValue([
        {
          questionId: 'q1',
          questionText: 'What is 2+2?',
          options: ['1', '2', '3', '4'],
          correctAnswerIndex: 3,
          explanation: 'Basic addition',
          difficultyLevel: 'Biết',
        },
      ]);

      // Mock repository create
      mockQuestionSetsRepo.create.mockResolvedValue({
        _id: 'qset123',
        userId,
        subjectId: payload.subjectId,
        title: payload.title,
        status: 'Draft',
        questions: [],
      });

      const result = await service.generate(userId, payload);

      expect(result).toMatchObject({
        id: 'qset123',
        status: 'Draft',
      });

      expect(mockQuestionSetsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          subjectId: payload.subjectId,
          title: payload.title,
          status: 'Draft',
        })
      );
    });

    it('should fallback to stub questions if LLM fails', async () => {
      mockSubjectsRepo.findByIdAndUser.mockResolvedValue({
        _id: payload.subjectId,
        userId,
      });

      mockDocumentsRepo.findBySubject.mockResolvedValue([]);

      // Mock LLM failure
      mockLLMClient.generateQuestions.mockRejectedValue(new Error('LLM API error'));

      mockQuestionSetsRepo.create.mockResolvedValue({
        _id: 'qset123',
        userId,
        status: 'Draft',
        questions: [],
      });

      const result = await service.generate(userId, payload);

      expect(result.status).toBe('Draft');
      expect(mockQuestionSetsRepo.create).toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    const userId = 'user123';
    const questionSetId = 'qset456';

    it('should return question set if user owns it', async () => {
      const mockQuestionSet = {
        _id: questionSetId,
        userId,
        title: 'Test Set',
        questions: [],
      };

      mockQuestionSetsRepo.findByIdAndUser.mockResolvedValue(mockQuestionSet);

      const result = await service.getById(userId, questionSetId);

      expect(result).toMatchObject({
        id: questionSetId,
        title: 'Test Set',
      });

      expect(mockQuestionSetsRepo.findByIdAndUser).toHaveBeenCalledWith(
        questionSetId,
        userId
      );
    });

    it('should throw NotFound if question set does not belong to user', async () => {
      mockQuestionSetsRepo.findByIdAndUser.mockResolvedValue(null);

      await expect(service.getById(userId, questionSetId)).rejects.toMatchObject({
        code: 'NotFound',
        status: 404,
      });
    });
  });

  describe('update', () => {
    const userId = 'user123';
    const questionSetId = 'qset456';

    it('should update allowed fields only', async () => {
      const payload = {
        title: 'Updated Title',
        userId: 'hacker999', // Should be ignored
        status: 'Published', // Should be ignored
      };

      mockQuestionSetsRepo.updateByIdAndUser.mockResolvedValue({
        _id: questionSetId,
        userId,
        title: 'Updated Title',
        status: 'Draft', // Not changed
      });

      const result = await service.update(userId, questionSetId, payload);

      expect(result.title).toBe('Updated Title');
      expect(result.status).toBe('Draft'); // Status not changed by user

      expect(mockQuestionSetsRepo.updateByIdAndUser).toHaveBeenCalledWith(
        questionSetId,
        userId,
        expect.objectContaining({
          title: 'Updated Title',
        })
      );
    });

    it('should throw NotFound if question set not found', async () => {
      mockQuestionSetsRepo.updateByIdAndUser.mockResolvedValue(null);

      await expect(
        service.update(userId, questionSetId, { title: 'New' })
      ).rejects.toMatchObject({
        code: 'NotFound',
        status: 404,
      });
    });
  });

  describe('remove', () => {
    const userId = 'user123';
    const questionSetId = 'qset456';

    it('should delete question set if user owns it', async () => {
      mockQuestionSetsRepo.deleteByIdAndUser.mockResolvedValue(true);

      await service.remove(userId, questionSetId);

      expect(mockQuestionSetsRepo.deleteByIdAndUser).toHaveBeenCalledWith(
        questionSetId,
        userId
      );
    });

    it('should throw NotFound if question set not found', async () => {
      mockQuestionSetsRepo.deleteByIdAndUser.mockResolvedValue(false);

      await expect(service.remove(userId, questionSetId)).rejects.toMatchObject({
        code: 'NotFound',
        status: 404,
      });
    });
  });

  describe('share', () => {
    const userId = 'user123';
    const questionSetId = 'qset456';

    it('should generate shared URL for question set', async () => {
      const sharedUrl = `shared-${Date.now()}`;
      
      mockQuestionSetsRepo.findByIdAndUser.mockResolvedValue({
        _id: questionSetId,
        userId,
      });

      mockQuestionSetsRepo.updateByIdAndUser.mockResolvedValue({
        _id: questionSetId,
        userId,
        sharedUrl,
        isShared: true,
      });

      const result = await service.share(userId, questionSetId);

      expect(result.isShared).toBe(true);
      expect(result.sharedUrl).toBeDefined();
      expect(typeof result.sharedUrl).toBe('string');
    });
  });
});
