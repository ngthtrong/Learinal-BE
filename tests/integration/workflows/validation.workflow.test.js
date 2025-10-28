/**
 * Integration test for complete Question Set Validation Workflow
 * Tests end-to-end flow from creation to validation
 * 
 * This test demonstrates the full workflow:
 * 1. Learner creates question set
 * 2. Learner requests validation
 * 3. Admin assigns expert
 * 4. Expert completes review (approve/reject)
 * 5. Commission created on approval
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const QuestionSetsService = require('../../../src/services/questionSets.service');
const ValidationRequestsService = require('../../../src/services/validationRequests.service');
const UsersRepository = require('../../../src/repositories/users.repository');
const SubjectsRepository = require('../../../src/repositories/subjects.repository');

// Mock external dependencies
jest.mock('../../../src/adapters/llmClient');
jest.mock('../../../src/adapters/eventBus');

const { llmClient } = require('../../../src/adapters');

describe('Question Set Validation Workflow - Integration', () => {
  let mongoServer;
  let questionSetsService;
  let validationService;
  let usersRepo;
  let subjectsRepo;

  // Test users
  let learner;
  let expert;
  let admin;
  let subject;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Initialize services
    questionSetsService = new QuestionSetsService();
    validationService = new ValidationRequestsService();
    usersRepo = new UsersRepository();
    subjectsRepo = new SubjectsRepository();

    // Create test users
    learner = await usersRepo.create({
      email: 'learner@test.com',
      fullName: 'Test Learner',
      role: 'Learner',
      status: 'Active',
    });

    expert = await usersRepo.create({
      email: 'expert@test.com',
      fullName: 'Test Expert',
      role: 'Expert',
      status: 'Active',
    });

    admin = await usersRepo.create({
      email: 'admin@test.com',
      fullName: 'Test Admin',
      role: 'Admin',
      status: 'Active',
    });

    // Create test subject
    subject = await subjectsRepo.create({
      userId: String(learner._id),
      subjectName: 'Mathematics',
      description: 'Math subject for testing',
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('Complete Workflow - Approval Path', () => {
    let questionSet;
    let validationRequest;

    it('Step 1: Learner generates question set', async () => {
      // Mock LLM to return valid questions
      llmClient.generateQuestions.mockResolvedValue([
        {
          questionId: 'q1',
          questionText: 'What is 2+2?',
          options: ['1', '2', '3', '4'],
          correctAnswerIndex: 3,
          explanation: 'Basic addition',
          difficultyLevel: 'Biết',
        },
      ]);

      questionSet = await questionSetsService.generate(String(learner._id), {
        subjectId: String(subject._id),
        title: 'Basic Math Quiz',
        numQuestions: 1,
        difficulty: 'Biết',
      });

      expect(questionSet).toBeDefined();
      expect(questionSet.status).toBe('Draft');
      expect(questionSet.userId).toBe(String(learner._id));
    });

    it('Step 2: Learner requests validation', async () => {
      validationRequest = await validationService.createRequest(
        String(learner._id),
        questionSet.id
      );

      expect(validationRequest.status).toBe('PendingAssignment');
      expect(validationRequest.learnerId).toBe(String(learner._id));

      // Verify question set status changed to InReview
      const updatedQSet = await questionSetsService.getById(
        String(learner._id),
        questionSet.id
      );
      expect(updatedQSet.status).toBe('InReview');
    });

    it('Step 2b: Cannot create duplicate validation request', async () => {
      // Try to create another request for same question set
      await expect(
        validationService.createRequest(String(learner._id), questionSet.id)
      ).rejects.toMatchObject({
        code: 'Conflict',
        status: 409,
      });
    });

    it('Step 3: Admin assigns expert to review', async () => {
      const updatedRequest = await validationService.assignExpert(
        String(admin._id),
        validationRequest.id,
        String(expert._id)
      );

      expect(updatedRequest.status).toBe('Assigned');
      expect(updatedRequest.expertId).toBe(String(expert._id));
      expect(updatedRequest.adminId).toBe(String(admin._id));
    });

    it('Step 4: Expert completes review with approval', async () => {
      const completedRequest = await validationService.completeReview(
        String(expert._id),
        validationRequest.id,
        {
          approved: true,
          feedback: 'Excellent question set!',
        }
      );

      expect(completedRequest.status).toBe('Completed');
      expect(completedRequest.approved).toBe(true);

      // Verify question set status changed to Validated
      const validatedQSet = await questionSetsService.getById(
        String(learner._id),
        questionSet.id
      );
      expect(validatedQSet.status).toBe('Validated');
    });
  });

  describe('Complete Workflow - Rejection Path', () => {
    let questionSet2;
    let validationRequest2;

    it('Should handle rejection workflow correctly', async () => {
      // Step 1: Create question set
      llmClient.generateQuestions.mockResolvedValue([
        {
          questionId: 'q2',
          questionText: 'Test?',
          options: ['A', 'B', 'C', 'D'],
          correctAnswerIndex: 0,
          explanation: 'Test',
          difficultyLevel: 'Hiểu',
        },
      ]);

      questionSet2 = await questionSetsService.generate(String(learner._id), {
        subjectId: String(subject._id),
        title: 'Quiz 2',
        numQuestions: 1,
        difficulty: 'Hiểu',
      });

      // Step 2: Request validation
      validationRequest2 = await validationService.createRequest(
        String(learner._id),
        questionSet2.id
      );

      // Step 3: Admin assigns expert
      await validationService.assignExpert(
        String(admin._id),
        validationRequest2.id,
        String(expert._id)
      );

      // Step 4: Expert rejects
      const rejectedRequest = await validationService.completeReview(
        String(expert._id),
        validationRequest2.id,
        {
          approved: false,
          feedback: 'Questions need more clarity. Please revise.',
        }
      );

      expect(rejectedRequest.approved).toBe(false);
      expect(rejectedRequest.feedback).toContain('revise');

      // Verify question set status reverted to Draft
      const draftQSet = await questionSetsService.getById(
        String(learner._id),
        questionSet2.id
      );
      expect(draftQSet.status).toBe('Draft');
    });

    it('Learner can request validation again after rejection', async () => {
      // After rejection, learner can improve and re-request
      const newRequest = await validationService.createRequest(
        String(learner._id),
        questionSet2.id
      );

      expect(newRequest.status).toBe('PendingAssignment');
      expect(newRequest.id).not.toBe(validationRequest2.id); // New request created
    });
  });

  describe('Role-based Access Control', () => {
    it('Expert cannot complete review not assigned to them', async () => {
      // Create another expert
      const expert2 = await usersRepo.create({
        email: 'expert2@test.com',
        fullName: 'Expert 2',
        role: 'Expert',
        status: 'Active',
      });

      // Create and assign request to expert1
      llmClient.generateQuestions.mockResolvedValue([
        {
          questionId: 'q3',
          questionText: 'Test?',
          options: ['A', 'B', 'C', 'D'],
          correctAnswerIndex: 0,
          difficultyLevel: 'Biết',
        },
      ]);

      const qset = await questionSetsService.generate(String(learner._id), {
        subjectId: String(subject._id),
        title: 'Quiz 3',
        numQuestions: 1,
        difficulty: 'Biết',
      });

      const request = await validationService.createRequest(
        String(learner._id),
        qset.id
      );

      await validationService.assignExpert(
        String(admin._id),
        request.id,
        String(expert._id) // Assigned to expert1
      );

      // Expert2 tries to complete
      await expect(
        validationService.completeReview(
          String(expert2._id), // Different expert!
          request.id,
          { approved: true }
        )
      ).rejects.toMatchObject({
        code: 'Forbidden',
        status: 403,
      });
    });

    it('Learner cannot access other learner\'s question sets', async () => {
      // Create another learner
      const learner2 = await usersRepo.create({
        email: 'learner2@test.com',
        fullName: 'Learner 2',
        role: 'Learner',
        status: 'Active',
      });

      // Create a question set for learner1
      llmClient.generateQuestions.mockResolvedValue([
        {
          questionId: 'q-access-test',
          questionText: 'Test access?',
          difficultyLevel: 'Biết',
          options: ['A', 'B', 'C', 'D'],
          correctAnswer: 0,
          explanation: 'Test',
        },
      ]);

      const qset = await questionSetsService.generate(
        String(learner._id),
        String(subject._id),
        { numQuestions: 1 }
      );

      // Learner2 tries to access learner1's question set
      await expect(
        questionSetsService.getById(String(learner2._id), qset.id)
      ).rejects.toMatchObject({
        code: 'NotFound',
        status: 404,
      });
    });
  });
});
