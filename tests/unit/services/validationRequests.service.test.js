/**
 * Unit tests for ValidationRequestsService
 * Tests validation workflow and business rules
 */

const ValidationRequestsService = require('../../../src/services/validationRequests.service');

jest.mock('../../../src/repositories/validationRequests.repository');
jest.mock('../../../src/repositories/questionSets.repository');
jest.mock('../../../src/repositories/users.repository');
jest.mock('../../../src/repositories/commissionRecords.repository');
jest.mock('../../../src/adapters/eventBus');

const ValidationRequestsRepository = require('../../../src/repositories/validationRequests.repository');
const QuestionSetsRepository = require('../../../src/repositories/questionSets.repository');
const UsersRepository = require('../../../src/repositories/users.repository');

describe('ValidationRequestsService', () => {
  let service;
  let mockValidationRepo;
  let mockQuestionSetsRepo;
  let mockUsersRepo;

  beforeEach(() => {
    jest.clearAllMocks();

    mockValidationRepo = new ValidationRequestsRepository();
    mockQuestionSetsRepo = new QuestionSetsRepository();
    mockUsersRepo = new UsersRepository();

    service = new ValidationRequestsService();
    service.repo = mockValidationRepo;
    service.questionSetsRepo = mockQuestionSetsRepo;
    service.usersRepo = mockUsersRepo;
  });

  describe('createRequest', () => {
    const userId = 'user123';
    const setId = 'set456';

    it('should create validation request for Draft question set', async () => {
      mockQuestionSetsRepo.findByIdAndUser.mockResolvedValue({
        _id: setId,
        userId,
        status: 'Draft',
      });

      mockValidationRepo.findOpenRequestBySet.mockResolvedValue(null);

      mockValidationRepo.create.mockResolvedValue({
        _id: 'req123',
        setId,
        learnerId: userId,
        status: 'PendingAssignment',
      });

      mockQuestionSetsRepo.updateById.mockResolvedValue({});

      const result = await service.createRequest(userId, setId);

      expect(result.status).toBe('PendingAssignment');
      expect(mockQuestionSetsRepo.updateById).toHaveBeenCalledWith(
        setId,
        expect.objectContaining({
          $set: { status: 'InReview' },
        })
      );
    });

    it('should throw NotFound if question set does not belong to user', async () => {
      mockQuestionSetsRepo.findByIdAndUser.mockResolvedValue(null);

      await expect(service.createRequest(userId, setId)).rejects.toMatchObject({
        code: 'NotFound',
        status: 404,
      });
    });

    it('should throw ValidationError if question set is already Validated', async () => {
      mockQuestionSetsRepo.findByIdAndUser.mockResolvedValue({
        _id: setId,
        userId,
        status: 'Validated', // Cannot request validation again
      });

      await expect(service.createRequest(userId, setId)).rejects.toMatchObject({
        code: 'ValidationError',
        status: 400,
      });
    });

    it('should throw Conflict if open request already exists', async () => {
      mockQuestionSetsRepo.findByIdAndUser.mockResolvedValue({
        _id: setId,
        userId,
        status: 'Draft',
      });

      mockValidationRepo.findOpenRequestBySet.mockResolvedValue({
        _id: 'existingReq',
        status: 'PendingAssignment',
      });

      await expect(service.createRequest(userId, setId)).rejects.toMatchObject({
        code: 'Conflict',
        status: 409,
      });
    });
  });

  describe('assignExpert', () => {
    const adminId = 'admin123';
    const requestId = 'req456';
    const expertId = 'expert789';

    it('should assign expert to pending request', async () => {
      mockValidationRepo.findById.mockResolvedValue({
        _id: requestId,
        status: 'PendingAssignment',
        setId: 'set123',
        learnerId: 'user123',
      });

      mockUsersRepo.findById.mockResolvedValue({
        _id: expertId,
        email: 'expert@example.com',
        role: 'Expert',
      });

      mockValidationRepo.assignExpert.mockResolvedValue({
        _id: requestId,
        expertId,
        adminId,
        status: 'Assigned',
      });

      const result = await service.assignExpert(adminId, requestId, expertId);

      expect(result.status).toBe('Assigned');
      expect(result.expertId).toBe(expertId);
    });

    it('should throw ValidationError if request is not PendingAssignment', async () => {
      mockValidationRepo.findById.mockResolvedValue({
        _id: requestId,
        status: 'Completed', // Cannot assign to completed request
      });

      await expect(
        service.assignExpert(adminId, requestId, expertId)
      ).rejects.toMatchObject({
        code: 'ValidationError',
        status: 400,
      });
    });

    it('should throw ValidationError if assigned user is not Expert', async () => {
      mockValidationRepo.findById.mockResolvedValue({
        _id: requestId,
        status: 'PendingAssignment',
      });

      mockUsersRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'Learner', // Not an expert!
      });

      await expect(
        service.assignExpert(adminId, requestId, expertId)
      ).rejects.toMatchObject({
        code: 'ValidationError',
        message: 'Assigned user must have Expert role',
        status: 400,
      });
    });

    it('should throw NotFound if expert user does not exist', async () => {
      mockValidationRepo.findById.mockResolvedValue({
        _id: requestId,
        status: 'PendingAssignment',
      });

      mockUsersRepo.findById.mockResolvedValue(null);

      await expect(
        service.assignExpert(adminId, requestId, expertId)
      ).rejects.toMatchObject({
        code: 'NotFound',
        status: 404,
      });
    });
  });

  describe('completeReview', () => {
    const expertId = 'expert123';
    const requestId = 'req456';

    it('should complete review and set status to Validated if approved', async () => {
      mockValidationRepo.findById.mockResolvedValue({
        _id: requestId,
        expertId,
        status: 'Assigned',
        setId: 'set123',
        learnerId: 'user456',
      });

      mockValidationRepo.complete.mockResolvedValue({
        _id: requestId,
        status: 'Completed',
      });

      mockQuestionSetsRepo.updateById.mockResolvedValue({});

      const result = await service.completeReview(expertId, requestId, {
        approved: true,
        feedback: 'Great work!',
      });

      expect(result.status).toBe('Completed');
      expect(result.approved).toBe(true);

      // Verify question set status updated to Validated
      expect(mockQuestionSetsRepo.updateById).toHaveBeenCalledWith(
        'set123',
        expect.objectContaining({
          $set: { status: 'Validated' },
        })
      );
    });

    it('should set status to Draft if rejected', async () => {
      mockValidationRepo.findById.mockResolvedValue({
        _id: requestId,
        expertId,
        status: 'Assigned',
        setId: 'set123',
        learnerId: 'user456',
      });

      mockValidationRepo.complete.mockResolvedValue({
        _id: requestId,
        status: 'Completed',
      });

      mockQuestionSetsRepo.updateById.mockResolvedValue({});

      const result = await service.completeReview(expertId, requestId, {
        approved: false,
        feedback: 'Needs improvement',
      });

      expect(result.approved).toBe(false);

      // Verify question set status reverted to Draft
      expect(mockQuestionSetsRepo.updateById).toHaveBeenCalledWith(
        'set123',
        expect.objectContaining({
          $set: { status: 'Draft' },
        })
      );
    });

    it('should throw Forbidden if wrong expert tries to complete', async () => {
      mockValidationRepo.findById.mockResolvedValue({
        _id: requestId,
        expertId: 'differentExpert',
        status: 'Assigned',
      });

      await expect(
        service.completeReview(expertId, requestId, { approved: true })
      ).rejects.toMatchObject({
        code: 'Forbidden',
        status: 403,
      });
    });

    it('should throw ValidationError if request is not Assigned', async () => {
      mockValidationRepo.findById.mockResolvedValue({
        _id: requestId,
        expertId,
        status: 'PendingAssignment', // Not yet assigned
      });

      await expect(
        service.completeReview(expertId, requestId, { approved: true })
      ).rejects.toMatchObject({
        code: 'ValidationError',
        status: 400,
      });
    });
  });

  describe('list - Role-based Access', () => {
    it('should return all requests for Admin', async () => {
      const adminUser = { id: 'admin1', role: 'Admin' };

      mockValidationRepo.paginate.mockResolvedValue({
        items: [{ _id: 'req1' }, { _id: 'req2' }],
        meta: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
      });

      const result = await service.list(adminUser, {});

      expect(result.items).toHaveLength(2);
      expect(mockValidationRepo.paginate).toHaveBeenCalled();
    });

    it('should return only assigned requests for Expert', async () => {
      const expertUser = { id: 'expert1', role: 'Expert' };

      mockValidationRepo.findByExpert.mockResolvedValue({
        items: [{ _id: 'req1', expertId: 'expert1' }],
        meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      });

      const result = await service.list(expertUser, {});

      expect(result.items).toHaveLength(1);
      expect(mockValidationRepo.findByExpert).toHaveBeenCalledWith(
        'expert1',
        expect.any(Object)
      );
    });

    it('should return only own requests for Learner', async () => {
      const learnerUser = { id: 'learner1', role: 'Learner' };

      mockValidationRepo.findByLearner.mockResolvedValue({
        items: [{ _id: 'req1', learnerId: 'learner1' }],
        meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      });

      const result = await service.list(learnerUser, {});

      expect(result.items).toHaveLength(1);
      expect(mockValidationRepo.findByLearner).toHaveBeenCalledWith(
        'learner1',
        expect.any(Object)
      );
    });
  });
});
