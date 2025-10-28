const QuestionSetsRepository = require('../repositories/questionSets.repository');
const DocumentsRepository = require('../repositories/documents.repository');
const LLMClient = require('../adapters/llmClient');
const { llm } = require('../config');
const logger = require('../utils/logger');

/**
 * Question Generation Job
 * Generates questions for a question set using LLM based on document context
 * 
 * @param {object} payload - { questionSetId, documentId?, numQuestions?, difficulty? }
 */
async function questionsGenerate(payload) {
  const {
    questionSetId,
    documentId,
    numQuestions = 10,
    difficulty = 'Hiểu',
  } = payload || {};

  if (!questionSetId) {
    logger.warn('[questions.generate] Missing questionSetId in payload');
    return;
  }

  const qsetsRepo = new QuestionSetsRepository();
  const docsRepo = new DocumentsRepository();

  try {
    // Fetch question set
    const questionSet = await qsetsRepo.findById(questionSetId);
    if (!questionSet) {
      logger.warn({ questionSetId }, '[questions.generate] Question set not found');
      return;
    }

    logger.info(
      {
        questionSetId,
        documentId,
        numQuestions,
        difficulty,
      },
      '[questions.generate] Starting question generation'
    );

    // Idempotency check: Skip if questions already exist
    if (questionSet.questions && questionSet.questions.length > 0) {
      logger.info(
        { questionSetId, existingCount: questionSet.questions.length },
        '[questions.generate] Questions already exist, skipping'
      );
      return;
    }

    // Build context from document(s)
    let contextText = '';

    if (documentId) {
      // Use specific document
      const doc = await docsRepo.findById(documentId);
      if (doc && doc.extractedText) {
        contextText = doc.extractedText.slice(0, 18000);
      }
    } else if (questionSet.subjectId) {
      // Use all documents from subject
      try {
        const { items: docs } = await docsRepo.findBySubject(questionSet.subjectId, {
          page: 1,
          pageSize: 5,
          sort: { uploadedAt: -1 },
        });

        const completedDocs = docs.filter((d) => d.status === 'Completed');
        if (completedDocs.length > 0) {
          const parts = completedDocs.map((d) => {
            const content = d.summaryFull || d.summaryShort || d.extractedText || '';
            return content.slice(0, 3000);
          });
          contextText = parts.join('\n\n---\n\n').slice(0, 18000);
        }
      } catch (err) {
        logger.warn(
          { questionSetId, error: err.message },
          '[questions.generate] Failed to fetch subject documents'
        );
      }
    }

    // Fallback to title if no context
    if (!contextText || contextText.trim().length === 0) {
      contextText = `Topic: ${questionSet.title || 'General'}`;
    }

    // Check LLM mode
    const mode = process.env.LLM_MODE || 'stub';
    let questions = [];

    if (mode === 'stub' || !llm.apiKey) {
      // Stub mode: generate fake questions
      logger.info({ questionSetId }, '[questions.generate] Using stub mode');
      questions = generateStubQuestions(numQuestions, difficulty, questionSet.title);
    } else {
      // Real mode: call LLM
      const llmClient = new LLMClient(llm);
      try {
        const result = await llmClient.generateQuestions({
          contextText,
          numQuestions,
          difficulty,
          topics: [],
        });

        questions = result.questions || [];

        // Validate questions
        questions = validateQuestions(questions, difficulty);

        if (questions.length === 0) {
          throw new Error('LLM returned no valid questions');
        }

        logger.info(
          { questionSetId, generatedCount: questions.length },
          '[questions.generate] Questions generated via LLM'
        );
      } catch (error) {
        logger.error(
          { questionSetId, error: error.message },
          '[questions.generate] LLM generation failed'
        );

        // Fallback to stub questions on error
        questions = generateStubQuestions(numQuestions, difficulty, questionSet.title);
      }
    }

    // Update question set with generated questions
    await qsetsRepo.updateById(questionSetId, {
      $set: { questions },
    });

    logger.info(
      { questionSetId, questionCount: questions.length },
      '[questions.generate] Question generation completed'
    );

  } catch (error) {
    logger.error(
      { questionSetId, error: error.message, stack: error.stack },
      '[questions.generate] Job failed'
    );
  }
}

/**
 * Generate stub questions for testing
 */
function generateStubQuestions(numQuestions, difficulty, title) {
  return Array.from({ length: numQuestions }, (_, i) => ({
    questionId: `q${Date.now()}_${i}`,
    questionText: `Câu ${i + 1}: ${title || 'Test question'}`,
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    correctAnswerIndex: Math.floor(Math.random() * 4),
    explanation: `Giải thích cho câu ${i + 1}`,
    topicTags: [],
    difficultyLevel: difficulty,
  }));
}

/**
 * Validate and sanitize questions from LLM
 */
function validateQuestions(questions, expectedDifficulty) {
  const validDifficulties = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'];

  return questions
    .filter((q) => {
      // Must have required fields
      if (!q.questionText || !Array.isArray(q.options) || q.correctAnswerIndex === undefined) {
        return false;
      }
      // Must have exactly 4 options
      if (q.options.length !== 4) {
        return false;
      }
      // correctAnswerIndex must be 0-3
      if (q.correctAnswerIndex < 0 || q.correctAnswerIndex > 3) {
        return false;
      }
      return true;
    })
    .map((q) => ({
      questionId: q.questionId || `q${Date.now()}_${Math.random()}`,
      questionText: q.questionText.trim(),
      options: q.options.map((opt) => String(opt).trim()),
      correctAnswerIndex: q.correctAnswerIndex,
      explanation: q.explanation || '',
      topicTags: Array.isArray(q.topicTags) ? q.topicTags : [],
      difficultyLevel: validDifficulties.includes(q.difficultyLevel)
        ? q.difficultyLevel
        : expectedDifficulty,
    }));
}

module.exports = questionsGenerate;
