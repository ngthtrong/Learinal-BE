/**
 * Smoke tests - Basic sanity checks for critical components
 * These tests verify that core services can be instantiated
 * and basic functionality is operational
 */

describe('Smoke Tests - Core Components', () => {
  describe('Service Instantiation', () => {
    it('should instantiate QuestionSetsService without errors', () => {
      const QuestionSetsService = require('../src/services/questionSets.service');
      const service = new QuestionSetsService();
      expect(service).toBeDefined();
      expect(service.repo).toBeDefined();
    });

    it('should instantiate QuizAttemptsService without errors', () => {
      const QuizAttemptsService = require('../src/services/quizAttempts.service');
      const service = new QuizAttemptsService();
      expect(service).toBeDefined();
      expect(service.repo).toBeDefined();
    });

    it('should instantiate ValidationRequestsService without errors', () => {
      const ValidationRequestsService = require('../src/services/validationRequests.service');
      const service = new ValidationRequestsService();
      expect(service).toBeDefined();
      expect(service.repo).toBeDefined();
    });

    it('should instantiate NotificationsService without errors', () => {
      const NotificationsService = require('../src/services/notifications.service');
      const service = new NotificationsService();
      expect(service).toBeDefined();
      expect(service.repo).toBeDefined();
    });
  });

  describe('Model Loading', () => {
    it('should load all Mongoose models', () => {
      const models = require('../src/models');
      
      expect(models.User).toBeDefined();
      expect(models.Subject).toBeDefined();
      expect(models.Document).toBeDefined();
      expect(models.QuestionSet).toBeDefined();
      expect(models.QuizAttempt).toBeDefined();
      expect(models.ValidationRequest).toBeDefined();
      expect(models.CommissionRecord).toBeDefined();
      expect(models.Notification).toBeDefined();
    });
  });

  describe('Repository Loading', () => {
    it('should instantiate all repositories', () => {
      const UsersRepository = require('../src/repositories/users.repository');
      const SubjectsRepository = require('../src/repositories/subjects.repository');
      const QuestionSetsRepository = require('../src/repositories/questionSets.repository');
      const QuizAttemptsRepository = require('../src/repositories/quizAttempts.repository');
      const ValidationRequestsRepository = require('../src/repositories/validationRequests.repository');
      const NotificationsRepository = require('../src/repositories/notifications.repository');

      expect(new UsersRepository()).toBeDefined();
      expect(new SubjectsRepository()).toBeDefined();
      expect(new QuestionSetsRepository()).toBeDefined();
      expect(new QuizAttemptsRepository()).toBeDefined();
      expect(new ValidationRequestsRepository()).toBeDefined();
      expect(new NotificationsRepository()).toBeDefined();
    });
  });

  describe('Job Handlers Loading', () => {
    it('should load all job handlers', () => {
      const documentIngestion = require('../src/jobs/document.ingestion');
      const contentSummary = require('../src/jobs/content.summary');
      const questionsGenerate = require('../src/jobs/questions.generate');
      const notificationsEmail = require('../src/jobs/notifications.email');
      const reviewAssigned = require('../src/jobs/review.assigned');
      const reviewCompleted = require('../src/jobs/review.completed');

      expect(typeof documentIngestion).toBe('function');
      expect(typeof contentSummary).toBe('function');
      expect(typeof questionsGenerate).toBe('function');
      expect(typeof notificationsEmail).toBe('function');
      expect(typeof reviewAssigned).toBe('function');
      expect(typeof reviewCompleted).toBe('function');
    });
  });
});

