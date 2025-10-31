# GIAI ĐOẠN 2: Business Workflows

**Thời gian:** 3 tuần  
**Mục tiêu:** Triển khai đầy đủ các business workflows theo SRS, loại bỏ stub logic

---

## Tổng quan

Giai đoạn này hoàn thiện các luồng nghiệp vụ chính:
1. Document Processing Pipeline (Upload → Extract → Summarize → ToC)
2. Question Generation Workflow
3. Validation/Review Workflow (Expert review)
4. Quiz Attempt & Scoring với Commission calculation
5. Notification System
6. Subscription Management

---

## Week 3: Document Processing Pipeline

### 3.1. Document Upload & Ingestion

#### A. Tình trạng hiện tại
- ✅ POST /documents endpoint có sẵn
- ✅ Multer middleware cho file upload
- ⚠️ Worker job `document.ingestion` còn cơ bản
- ⚠️ Chưa có text extraction đầy đủ (PDF, DOCX, TXT)
- ⚠️ Chưa có error recovery cho extraction failures

#### B. Cần triển khai

##### Document Controller Enhancement

```javascript
// src/controllers/documents.controller.js

async function uploadDocument(req, res, next) {
  try {
    const { subjectId } = req.body;
    const file = req.file; // Multer
    const userId = req.user.id;

    // 🔴 KIỂM TRA: Validate subject ownership
    const subject = await SubjectsRepository.findById(subjectId);
    if (!subject || subject.userId.toString() !== userId) {
      return res.status(404).json({
        code: 'NotFound',
        message: 'Subject not found or access denied',
      });
    }

    // 🔴 KIỂM TRA: Check subscription limits
    const canUpload = await UserService.checkDocumentUploadLimit(userId);
    if (!canUpload) {
      return res.status(403).json({
        code: 'QuotaExceeded',
        message: 'Document upload limit reached for your subscription plan',
      });
    }

    // Upload to storage (S3)
    const storageClient = new StorageClient(storageConfig);
    const { storagePath, size } = await storageClient.upload(file, {
      userId,
      subjectId,
    });

    // Create document record
    const document = await DocumentsRepository.create({
      subjectId,
      ownerId: userId,
      originalFileName: file.originalname,
      fileType: path.extname(file.originalname),
      fileSize: size / (1024 * 1024), // MB
      storagePath,
      status: 'Uploading', // → Processing → Completed/Error
      uploadedAt: new Date(),
    });

    // 🔴 ENQUEUE: Async processing
    await enqueueDocumentIngestion({
      documentId: document.id,
      storagePath,
      fileType: document.fileType,
    });

    // Update status to Processing
    await DocumentsRepository.update(document.id, { status: 'Processing' });

    res.status(201).json({
      id: document.id,
      subjectId: document.subjectId,
      originalFileName: document.originalFileName,
      fileSize: document.fileSize,
      status: 'Processing',
      uploadedAt: document.uploadedAt,
    });
  } catch (error) {
    next(error);
  }
}
```

##### Document Ingestion Worker (Complete)

```javascript
// src/jobs/document.ingestion.js

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const DocumentsRepository = require('../repositories/documents.repository');
const StorageClient = require('../adapters/storageClient');
const { enqueueContentSummary } = require('../adapters/queue');

async function documentIngestionJob(job) {
  const { documentId, storagePath, fileType } = job.data;
  
  logger.info({ jobId: job.id, documentId, fileType }, 'Starting document ingestion');

  try {
    // 1. Download file from storage
    const storageClient = new StorageClient(storageConfig);
    const fileBuffer = await downloadFile(storageClient, storagePath);

    // 2. Extract text based on file type
    let extractedText = '';
    
    if (fileType === '.pdf') {
      extractedText = await extractPDF(fileBuffer);
    } else if (fileType === '.docx') {
      extractedText = await extractDOCX(fileBuffer);
    } else if (fileType === '.txt') {
      extractedText = fileBuffer.toString('utf-8');
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }

    // 3. Validate extracted text
    if (!extractedText || extractedText.trim().length < 100) {
      throw new Error('Insufficient text extracted from document');
    }

    logger.info({ 
      documentId, 
      textLength: extractedText.length 
    }, 'Text extracted successfully');

    // 4. Update document with extracted text
    await DocumentsRepository.update(documentId, {
      extractedText,
      status: 'Completed',
    });

    // 5. Enqueue summary generation
    await enqueueContentSummary({
      documentId,
      extractedText: extractedText.substring(0, 50000), // Limit for LLM
    });

    logger.info({ documentId }, 'Document ingestion completed');
    
    // 6. Send notification to user
    await enqueueEmail({
      to: /* get user email from documentId */,
      templateId: 'documentProcessed',
      variables: {
        userName: /* get user name */,
        documentName: /* get document name */,
        documentLink: `${appBaseUrl}/documents/${documentId}`,
      },
    });

  } catch (error) {
    logger.error({ 
      jobId: job.id, 
      documentId, 
      error: error.message 
    }, 'Document ingestion failed');

    // Update document status to Error
    await DocumentsRepository.update(documentId, {
      status: 'Error',
      errorMessage: error.message,
    });

    throw error; // BullMQ will handle retry
  }
}

async function downloadFile(storageClient, storagePath) {
  if (storageClient.provider === 's3') {
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: storageClient.config.s3Region });
    
    const command = new GetObjectCommand({
      Bucket: storageClient.config.s3Bucket,
      Key: storagePath,
    });
    
    const response = await s3.send(command);
    const chunks = [];
    
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  }
  
  if (storageClient.provider === 'local') {
    return fs.readFile(storagePath);
  }
  
  throw new Error('Unsupported storage provider');
}

async function extractPDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

async function extractDOCX(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    throw new Error(`DOCX extraction failed: ${error.message}`);
  }
}

module.exports = { documentIngestionJob };
```

##### Content Summary Worker

```javascript
// src/jobs/content.summary.js

const DocumentsRepository = require('../repositories/documents.repository');
const SubjectsRepository = require('../repositories/subjects.repository');
const LLMClient = require('../adapters/llmClient');
const logger = require('../utils/logger');

async function contentSummaryJob(job) {
  const { documentId, extractedText } = job.data;
  
  logger.info({ jobId: job.id, documentId }, 'Starting content summary generation');

  try {
    const llmClient = new LLMClient(llmConfig);

    // 1. Generate short summary (1-2 paragraphs)
    const shortSummary = await llmClient.generateSummary({
      documentText: extractedText,
      summaryType: 'short',
    });

    // 2. Generate full summary (detailed)
    const fullSummary = await llmClient.generateSummary({
      documentText: extractedText,
      summaryType: 'full',
    });

    // 3. Generate table of contents
    const toc = await llmClient.generateTableOfContents({
      documentText: extractedText,
    });

    // 4. Update document
    await DocumentsRepository.update(documentId, {
      summaryShort: shortSummary.summary,
      summaryFull: fullSummary.summary,
      summaryUpdatedAt: new Date(),
    });

    // 5. Update subject ToC (nếu subject chưa có)
    const document = await DocumentsRepository.findById(documentId);
    const subject = await SubjectsRepository.findById(document.subjectId);
    
    if (!subject.tableOfContents || subject.tableOfContents.length === 0) {
      await SubjectsRepository.update(subject.id, {
        tableOfContents: toc.tableOfContents,
        summary: fullSummary.summary,
      });
    }

    logger.info({ documentId }, 'Content summary completed');

  } catch (error) {
    logger.error({ 
      jobId: job.id, 
      documentId, 
      error: error.message 
    }, 'Content summary failed');

    throw error;
  }
}

module.exports = { contentSummaryJob };
```

#### C. Checklist

- [ ] Implement document upload limit check theo subscription
- [ ] Complete PDF text extraction với error handling
- [ ] Complete DOCX text extraction
- [ ] Handle TXT files
- [ ] Implement file download from S3 trong worker
- [ ] Generate short summary
- [ ] Generate full summary
- [ ] Generate table of contents
- [ ] Update subject với ToC nếu chưa có
- [ ] Send notification khi document processed
- [ ] Error handling & status updates
- [ ] Tests: Upload → Extract → Summary flow

---

### 3.2. Question Generation Workflow

#### A. Tình trạng hiện tại
- ✅ POST /question-sets/generate endpoint có sẵn
- ⚠️ LLM generate questions còn basic
- ⚠️ Chưa có validation cho difficulty levels
- ⚠️ Chưa có idempotency check
- ⚠️ Chưa có progress tracking

#### B. Cần triển khai

##### Question Generation Controller Enhancement

```javascript
// src/controllers/questionSets.controller.js

async function generateQuestionSet(req, res, next) {
  try {
    const {
      documentId,
      topics = [],
      difficulty,
      numQuestions,
      title,
    } = req.body;
    const userId = req.user.id;

    // 🔴 IDEMPOTENCY: Check Idempotency-Key header
    const idempotencyKey = req.headers['idempotency-key'];
    if (idempotencyKey) {
      const existing = await checkIdempotency(idempotencyKey, userId);
      if (existing) {
        return res.status(200).json(existing); // Return cached result
      }
    }

    // Validate document ownership
    const document = await DocumentsRepository.findById(documentId);
    if (!document || document.ownerId.toString() !== userId) {
      return res.status(404).json({
        code: 'NotFound',
        message: 'Document not found',
      });
    }

    // Check document status
    if (document.status !== 'Completed') {
      return res.status(400).json({
        code: 'InvalidState',
        message: 'Document is not ready for question generation',
        details: { currentStatus: document.status },
      });
    }

    // 🔴 KIỂM TRA: Validate difficulty level
    const allowedDifficulties = ['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'];
    if (difficulty && !allowedDifficulties.includes(difficulty)) {
      return res.status(400).json({
        code: 'ValidationError',
        message: 'Invalid difficulty level',
        details: { allowed: allowedDifficulties },
      });
    }

    // 🔴 KIỂM TRA: Validate numQuestions
    if (numQuestions < 1 || numQuestions > 100) {
      return res.status(400).json({
        code: 'ValidationError',
        message: 'Number of questions must be between 1 and 100',
      });
    }

    // 🔴 KIỂM TRA: Check subscription limits
    const canGenerate = await UserService.checkQuestionGenerationLimit(userId);
    if (!canGenerate) {
      return res.status(403).json({
        code: 'QuotaExceeded',
        message: 'Question generation limit reached for your subscription plan',
      });
    }

    // Create question set record (status: Draft)
    const questionSet = await QuestionSetsRepository.create({
      userId,
      subjectId: document.subjectId,
      title: title || `Questions from ${document.originalFileName}`,
      status: 'Draft',
      isShared: false,
      questions: [], // Will be populated by worker
    });

    // 🔴 ENQUEUE: Async generation
    await enqueueQuestionsGenerate({
      questionSetId: questionSet.id,
      documentId,
      extractedText: document.extractedText,
      topics,
      difficulty: difficulty || 'Hiểu',
      numQuestions: numQuestions || 10,
      idempotencyKey,
    });

    // 🔴 CACHE: Store idempotency result
    if (idempotencyKey) {
      await cacheIdempotencyResult(idempotencyKey, userId, questionSet, 3600);
    }

    // Return 202 Accepted
    res.status(202).json({
      id: questionSet.id,
      status: 'Draft',
      title: questionSet.title,
      message: 'Question generation in progress',
    });

  } catch (error) {
    next(error);
  }
}

// 🔴 HELPER: Idempotency check
async function checkIdempotency(key, userId) {
  const redis = getRedisClient();
  if (!redis) return null;
  
  const cacheKey = `idempotency:${userId}:${key}`;
  const cached = await redis.get(cacheKey);
  
  return cached ? JSON.parse(cached) : null;
}

async function cacheIdempotencyResult(key, userId, result, ttl) {
  const redis = getRedisClient();
  if (!redis) return;
  
  const cacheKey = `idempotency:${userId}:${key}`;
  await redis.setex(cacheKey, ttl, JSON.stringify(result));
}
```

##### Question Generation Worker

```javascript
// src/jobs/questions.generate.js

const QuestionSetsRepository = require('../repositories/questions.repository');
const LLMClient = require('../adapters/llmClient');
const logger = require('../utils/logger');

async function questionsGenerateJob(job) {
  const {
    questionSetId,
    documentId,
    extractedText,
    topics,
    difficulty,
    numQuestions,
  } = job.data;

  logger.info({ 
    jobId: job.id, 
    questionSetId, 
    numQuestions,
    difficulty 
  }, 'Starting question generation');

  try {
    const llmClient = new LLMClient(llmConfig);

    // Generate questions
    const result = await llmClient.generateQuestions({
      contextText: extractedText,
      topics,
      difficulty,
      numQuestions,
    });

    // 🔴 VALIDATE: Ensure all questions have required fields
    const validQuestions = result.questions.filter(q => 
      q.questionText &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      typeof q.correctAnswerIndex === 'number' &&
      q.correctAnswerIndex >= 0 &&
      q.correctAnswerIndex <= 3 &&
      q.difficultyLevel
    );

    if (validQuestions.length < numQuestions * 0.8) {
      throw new Error('LLM generated insufficient valid questions');
    }

    // 🔴 NORMALIZE: Ensure difficultyLevel is set
    validQuestions.forEach(q => {
      if (!['Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao'].includes(q.difficultyLevel)) {
        q.difficultyLevel = difficulty; // Fallback to requested difficulty
      }
    });

    // Update question set
    await QuestionSetsRepository.update(questionSetId, {
      questions: validQuestions,
      status: 'Private', // Ready for use, but not published
    });

    logger.info({ 
      questionSetId, 
      generatedCount: validQuestions.length 
    }, 'Question generation completed');

    // 🔴 NOTIFY: Send email to user
    await enqueueEmail({
      to: /* get user email */,
      templateId: 'questionsGenerated',
      variables: {
        userName: /* ... */,
        setTitle: /* ... */,
        numQuestions: validQuestions.length,
        setLink: `${appBaseUrl}/question-sets/${questionSetId}`,
      },
    });

  } catch (error) {
    logger.error({ 
      jobId: job.id, 
      questionSetId, 
      error: error.message 
    }, 'Question generation failed');

    // Update status to Error
    await QuestionSetsRepository.update(questionSetId, {
      status: 'Error',
      errorMessage: error.message,
    });

    throw error;
  }
}

module.exports = { questionsGenerateJob };
```

#### C. Checklist

- [ ] Implement idempotency check với Idempotency-Key header
- [ ] Validate difficulty levels
- [ ] Validate numQuestions range
- [ ] Check subscription limits cho question generation
- [ ] Enqueue async generation job
- [ ] Worker: Generate questions với LLM
- [ ] Worker: Validate generated questions structure
- [ ] Worker: Normalize difficulty levels
- [ ] Worker: Update question set status
- [ ] Send notification khi generation completed
- [ ] Error handling & retry logic
- [ ] Tests: Generate questions flow end-to-end

---

## Week 4: Validation/Review Workflow

### 4.1. Request Validation (Learner → Expert)

#### A. Workflow Overview

```
Learner creates validation request
  ↓
System assigns to available Expert
  ↓
Expert receives notification
  ↓
Expert reviews questions
  ↓
Expert approves/rejects với feedback
  ↓
System updates question set status
  ↓
Learner receives notification
  ↓
If approved: Calculate commission
```

#### B. Cần triển khai

##### Request Validation Endpoint

```javascript
// src/controllers/questionSets.controller.js

async function requestValidation(req, res, next) {
  try {
    const { id: setId } = req.params;
    const userId = req.user.id;

    // Validate ownership
    const questionSet = await QuestionSetsRepository.findById(setId);
    if (!questionSet || questionSet.userId.toString() !== userId) {
      return res.status(404).json({
        code: 'NotFound',
        message: 'Question set not found',
      });
    }

    // 🔴 KIỂM TRA: Check if already has pending/assigned validation request
    const existingRequest = await ValidationRequestsRepository.findOne({
      setId,
      status: { $in: ['PendingAssignment', 'Assigned'] },
    });

    if (existingRequest) {
      return res.status(409).json({
        code: 'Conflict',
        message: 'Validation request already exists for this question set',
        details: { requestId: existingRequest.id, status: existingRequest.status },
      });
    }

    // 🔴 KIỂM TRA: Check subscription entitlement
    const canRequest = await UserService.checkValidationRequestLimit(userId);
    if (!canRequest) {
      return res.status(403).json({
        code: 'QuotaExceeded',
        message: 'Validation request limit reached for your subscription plan',
      });
    }

    // Create validation request
    const validationRequest = await ValidationRequestsRepository.create({
      setId,
      learnerId: userId,
      requesterId: userId,
      status: 'PendingAssignment',
      requestTime: new Date(),
    });

    // 🔴 ENQUEUE: Assignment job (find available Expert)
    await enqueueValidationAssignment({
      requestId: validationRequest.id,
      setId,
    });

    res.status(202).json({
      id: validationRequest.id,
      setId,
      status: 'PendingAssignment',
      requestTime: validationRequest.requestTime,
      message: 'Validation request submitted. An expert will be assigned shortly.',
    });

  } catch (error) {
    next(error);
  }
}
```

##### Validation Assignment Worker

```javascript
// src/jobs/review.assigned.js

const ValidationRequestsRepository = require('../repositories/validationRequests.repository');
const UsersRepository = require('../repositories/users.repository');
const QuestionSetsRepository = require('../repositories/questionSets.repository');
const { enqueueEmail } = require('../adapters/queue');
const logger = require('../utils/logger');

async function validationAssignmentJob(job) {
  const { requestId, setId } = job.data;

  logger.info({ jobId: job.id, requestId }, 'Assigning validation request');

  try {
    // 🔴 LOGIC: Find available Expert
    // Strategy: Round-robin, least loaded, or manual assignment
    const expert = await findAvailableExpert();

    if (!expert) {
      // No expert available - keep in PendingAssignment, will retry
      logger.warn({ requestId }, 'No expert available for assignment');
      throw new Error('No expert available');
    }

    // Assign to expert
    await ValidationRequestsRepository.update(requestId, {
      expertId: expert.id,
      status: 'Assigned',
      assignedTime: new Date(),
    });

    // Update question set status
    await QuestionSetsRepository.update(setId, {
      status: 'UnderReview',
    });

    logger.info({ 
      requestId, 
      expertId: expert.id 
    }, 'Validation request assigned');

    // 🔴 NOTIFY: Send email to Expert
    const questionSet = await QuestionSetsRepository.findById(setId);
    const subject = await SubjectsRepository.findById(questionSet.subjectId);

    await enqueueEmail({
      to: expert.email,
      templateId: 'validationAssigned',
      variables: {
        expertName: expert.fullName,
        setTitle: questionSet.title,
        subjectName: subject.subjectName,
        numQuestions: questionSet.questions.length,
        reviewLink: `${appBaseUrl}/validation-requests/${requestId}`,
      },
    });

  } catch (error) {
    logger.error({ 
      jobId: job.id, 
      requestId, 
      error: error.message 
    }, 'Validation assignment failed');

    throw error; // Will retry
  }
}

async function findAvailableExpert() {
  // 🔴 STRATEGY 1: Find Expert with least active assignments
  const experts = await UsersRepository.findByRole('Expert', { status: 'Active' });

  if (experts.length === 0) return null;

  // Count active assignments for each expert
  const expertsWithLoad = await Promise.all(
    experts.map(async (expert) => {
      const activeCount = await ValidationRequestsRepository.countByExpert(
        expert.id,
        { status: 'Assigned' }
      );
      return { expert, activeCount };
    })
  );

  // Sort by load (ascending)
  expertsWithLoad.sort((a, b) => a.activeCount - b.activeCount);

  // Return expert with least load
  return expertsWithLoad[0].expert;
}

module.exports = { validationAssignmentJob };
```

##### Expert Review Completion

```javascript
// src/controllers/validationRequests.controller.js

async function completeValidation(req, res, next) {
  try {
    const { id: requestId } = req.params;
    const { decision, feedback, correctedQuestions } = req.body;
    const expertId = req.user.id;

    // Validate request ownership
    const request = await ValidationRequestsRepository.findById(requestId);
    if (!request || request.expertId.toString() !== expertId) {
      return res.status(404).json({
        code: 'NotFound',
        message: 'Validation request not found',
      });
    }

    if (request.status !== 'Assigned') {
      return res.status(400).json({
        code: 'InvalidState',
        message: 'Validation request is not in Assigned state',
      });
    }

    // 🔴 VALIDATE: Decision must be 'Approved' or 'Rejected'
    if (!['Approved', 'Rejected'].includes(decision)) {
      return res.status(400).json({
        code: 'ValidationError',
        message: 'Decision must be Approved or Rejected',
      });
    }

    // Update validation request
    const updateData = {
      status: decision === 'Approved' ? 'Approved' : 'Rejected',
      decision,
      feedback,
      completionTime: new Date(),
    };

    await ValidationRequestsRepository.update(requestId, updateData);

    // Update question set
    const questionSet = await QuestionSetsRepository.findById(request.setId);
    
    if (decision === 'Approved') {
      // Apply corrections if provided
      const finalQuestions = correctedQuestions || questionSet.questions;
      
      await QuestionSetsRepository.update(request.setId, {
        status: 'Validated',
        questions: finalQuestions,
      });

      // 🔴 ENQUEUE: Commission calculation
      await enqueueCommissionCalculation({
        validationRequestId: requestId,
        expertId,
        setId: request.setId,
      });
    } else {
      await QuestionSetsRepository.update(request.setId, {
        status: 'Private', // Back to private, learner can edit
      });
    }

    // 🔴 NOTIFY: Send email to Learner
    const learner = await UsersRepository.findById(request.learnerId);
    
    await enqueueEmail({
      to: learner.email,
      templateId: 'validationCompleted',
      variables: {
        learnerName: learner.fullName,
        setTitle: questionSet.title,
        status: decision === 'Approved' ? 'approved' : 'rejected',
        feedback,
        setLink: `${appBaseUrl}/question-sets/${request.setId}`,
      },
    });

    res.status(200).json({
      id: requestId,
      status: updateData.status,
      decision,
      completionTime: updateData.completionTime,
    });

  } catch (error) {
    next(error);
  }
}
```

#### C. Checklist

- [ ] Implement request validation endpoint với checks
- [ ] Check for existing pending/assigned requests (unique constraint)
- [ ] Check subscription validation limits
- [ ] Create validation request record
- [ ] Enqueue assignment job
- [ ] Worker: Find available Expert (strategy: least loaded)
- [ ] Worker: Assign request to Expert
- [ ] Worker: Send notification to Expert
- [ ] Implement complete validation endpoint
- [ ] Validate decision (Approved/Rejected)
- [ ] Update question set status
- [ ] Apply question corrections if provided
- [ ] Enqueue commission calculation
- [ ] Send notification to Learner
- [ ] Tests: Full validation workflow

---

## Week 5: Quiz Attempts, Scoring & Commissions

### 5.1. Quiz Attempt Flow

#### A. Start Quiz Attempt

```javascript
// src/controllers/quizAttempts.controller.js

async function startQuizAttempt(req, res, next) {
  try {
    const { setId } = req.body;
    const userId = req.user.id;

    // Validate question set
    const questionSet = await QuestionSetsRepository.findById(setId);
    if (!questionSet) {
      return res.status(404).json({
        code: 'NotFound',
        message: 'Question set not found',
      });
    }

    // 🔴 KIỂM TRA: Check if set is accessible
    // Private: Only owner can access
    // Validated/Published: Anyone can access
    // Shared: Anyone with link can access
    const canAccess = await QuizAttemptsService.checkQuestionSetAccess(
      userId,
      questionSet
    );
    
    if (!canAccess) {
      return res.status(403).json({
        code: 'Forbidden',
        message: 'You do not have access to this question set',
      });
    }

    // Create quiz attempt
    const attempt = await QuizAttemptsRepository.create({
      userId,
      setId,
      userAnswers: [], // Will be populated on submit
      score: 0,
      isCompleted: false,
      startTime: new Date(),
    });

    res.status(201).json({
      id: attempt.id,
      setId: attempt.setId,
      startTime: attempt.startTime,
      questions: questionSet.questions.map(q => ({
        questionId: q.questionId,
        questionText: q.questionText,
        options: q.options,
        difficultyLevel: q.difficultyLevel,
        // Don't include correctAnswerIndex or explanation
      })),
    });

  } catch (error) {
    next(error);
  }
}
```

#### B. Submit Quiz Attempt với Scoring

```javascript
async function submitQuizAttempt(req, res, next) {
  try {
    const { id: attemptId } = req.params;
    const { answers } = req.body; // [{ questionId, selectedIndex }]
    const userId = req.user.id;

    // Validate attempt ownership
    const attempt = await QuizAttemptsRepository.findById(attemptId);
    if (!attempt || attempt.userId.toString() !== userId) {
      return res.status(404).json({
        code: 'NotFound',
        message: 'Quiz attempt not found',
      });
    }

    if (attempt.isCompleted) {
      return res.status(400).json({
        code: 'InvalidState',
        message: 'Quiz attempt already completed',
      });
    }

    // Get question set
    const questionSet = await QuestionSetsRepository.findById(attempt.setId);

    // 🔴 CALCULATE SCORE: Theo công thức trong SRS (trọng số theo độ khó)
    const scoringResult = QuizAttemptsService.calculateScore(
      questionSet.questions,
      answers
    );

    // Update attempt
    await QuizAttemptsRepository.update(attemptId, {
      userAnswers: scoringResult.userAnswers,
      score: scoringResult.totalScore,
      isCompleted: true,
      endTime: new Date(),
    });

    // 🔴 COMMISSION: If set is Validated, trigger commission
    if (questionSet.status === 'Validated') {
      const validationRequest = await ValidationRequestsRepository.findOne({
        setId: questionSet.id,
        status: 'Approved',
      });

      if (validationRequest && validationRequest.expertId) {
        await enqueueCommissionCalculation({
          attemptId: attempt.id,
          expertId: validationRequest.expertId,
          setId: questionSet.id,
        });
      }
    }

    res.status(200).json({
      id: attemptId,
      score: scoringResult.totalScore,
      maxScore: scoringResult.maxScore,
      correctCount: scoringResult.correctCount,
      totalQuestions: questionSet.questions.length,
      userAnswers: scoringResult.userAnswers.map(ua => ({
        questionId: ua.questionId,
        selectedIndex: ua.selectedIndex,
        isCorrect: ua.isCorrect,
        correctAnswerIndex: ua.correctAnswerIndex,
        explanation: ua.explanation,
      })),
      endTime: new Date(),
    });

  } catch (error) {
    next(error);
  }
}
```

#### C. Scoring Service (Theo SRS 4.1.1)

```javascript
// src/services/quizAttempts.service.js

class QuizAttemptsService {
  /**
   * Calculate score với trọng số theo độ khó
   * Công thức theo SRS:
   * - Biết: 1 điểm
   * - Hiểu: 2 điểm
   * - Vận dụng: 3 điểm
   * - Vận dụng cao: 4 điểm
   */
  static calculateScore(questions, userAnswers) {
    const difficultyWeights = {
      'Biết': 1,
      'Hiểu': 2,
      'Vận dụng': 3,
      'Vận dụng cao': 4,
    };

    let totalScore = 0;
    let maxScore = 0;
    let correctCount = 0;

    const scoredAnswers = questions.map(q => {
      const weight = difficultyWeights[q.difficultyLevel] || 1;
      maxScore += weight;

      const userAnswer = userAnswers.find(a => a.questionId === q.questionId);
      const selectedIndex = userAnswer?.selectedIndex ?? -1;
      const isCorrect = selectedIndex === q.correctAnswerIndex;

      if (isCorrect) {
        totalScore += weight;
        correctCount += 1;
      }

      return {
        questionId: q.questionId,
        selectedIndex,
        isCorrect,
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation,
        difficultyLevel: q.difficultyLevel,
        pointsEarned: isCorrect ? weight : 0,
      };
    });

    return {
      userAnswers: scoredAnswers,
      totalScore,
      maxScore,
      correctCount,
      accuracy: questions.length > 0 ? (correctCount / questions.length) * 100 : 0,
    };
  }

  static checkQuestionSetAccess(userId, questionSet) {
    // Owner always has access
    if (questionSet.userId.toString() === userId) {
      return true;
    }

    // Validated/Published sets are public
    if (['Validated', 'Published'].includes(questionSet.status)) {
      return true;
    }

    // Shared sets are accessible via link
    if (questionSet.isShared) {
      return true;
    }

    return false;
  }
}

module.exports = QuizAttemptsService;
```

### 5.2. Commission Calculation (Theo SRS 4.1.2)

```javascript
// src/jobs/commission.calculate.js

const CommissionRecordsRepository = require('../repositories/commissionRecords.repository');
const QuizAttemptsRepository = require('../repositories/quizAttempts.repository');
const ValidationRequestsRepository = require('../repositories/validationRequests.repository');
const logger = require('../utils/logger');

async function commissionCalculationJob(job) {
  const { attemptId, expertId, setId } = job.data;

  logger.info({ jobId: job.id, attemptId, expertId }, 'Calculating commission');

  try {
    // Get attempt
    const attempt = await QuizAttemptsRepository.findById(attemptId);
    if (!attempt || !attempt.isCompleted) {
      throw new Error('Invalid quiz attempt');
    }

    // 🔴 CÔNG THỨC HOA HỒNG (từ SRS 4.1.2):
    // Commission = (Number of questions in set) × (Base rate per question)
    // Base rate: Configurable, ví dụ 1,000 VND/question
    
    const questionSet = await QuestionSetsRepository.findById(setId);
    const numQuestions = questionSet.questions.length;
    const baseRatePerQuestion = 1000; // VND, from config
    const commissionAmount = numQuestions * baseRatePerQuestion;

    // Create commission record
    await CommissionRecordsRepository.create({
      expertId,
      setId,
      attemptId,
      amount: commissionAmount,
      transactionDate: new Date(),
      status: 'Pending', // Admin will mark as Paid later
    });

    logger.info({ 
      expertId, 
      setId, 
      amount: commissionAmount 
    }, 'Commission calculated');

  } catch (error) {
    logger.error({ 
      jobId: job.id, 
      attemptId, 
      error: error.message 
    }, 'Commission calculation failed');

    throw error;
  }
}

module.exports = { commissionCalculationJob };
```

#### Checklist

- [ ] Implement start quiz attempt endpoint
- [ ] Check question set access permissions
- [ ] Create quiz attempt record
- [ ] Return questions without answers/explanations
- [ ] Implement submit quiz attempt endpoint
- [ ] Implement scoring logic theo trọng số độ khó
- [ ] Calculate total score, max score, accuracy
- [ ] Return detailed results với explanations
- [ ] Trigger commission calculation cho validated sets
- [ ] Implement commission calculation worker
- [ ] Apply commission formula từ SRS
- [ ] Create commission records
- [ ] Tests: Quiz flow end-to-end với scoring

---

## Week 5: Subscription Management (con't)

### 5.3. Subscription Plans & Purchase

#### A. Subscription Plans Management

```javascript
// src/controllers/subscriptionPlans.controller.js

async function listSubscriptionPlans(req, res, next) {
  try {
    // Get all active subscription plans
    const plans = await SubscriptionPlansRepository.find({
      status: 'Active',
    });

    res.status(200).json({
      items: plans.map(plan => ({
        id: plan.id,
        planName: plan.planName,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        billingCycle: plan.billingCycle,
        entitlements: plan.entitlements,
        features: plan.features,
      })),
    });
  } catch (error) {
    next(error);
  }
}
```

#### B. Purchase Subscription

```javascript
// src/controllers/userSubscriptions.controller.js

async function purchaseSubscription(req, res, next) {
  try {
    const { planId, billingCycle } = req.body; // 'Monthly' | 'Yearly'
    const userId = req.user.id;

    // Validate plan
    const plan = await SubscriptionPlansRepository.findById(planId);
    if (!plan || plan.status !== 'Active') {
      return res.status(404).json({
        code: 'NotFound',
        message: 'Subscription plan not found',
      });
    }

    // 🔴 KIỂM TRA: Check if user already has active subscription
    const existingSubscription = await UserSubscriptionsRepository.findOne({
      userId,
      status: 'Active',
    });

    if (existingSubscription) {
      return res.status(409).json({
        code: 'Conflict',
        message: 'You already have an active subscription',
        details: { currentPlanId: existingSubscription.planId },
      });
    }

    // Calculate price
    const price = billingCycle === 'Yearly' 
      ? plan.priceYearly 
      : plan.priceMonthly;

    // 🔴 CREATE: Stripe Payment Intent
    const paymentClient = new PaymentClient(paymentConfig);
    const paymentIntent = await paymentClient.createPaymentIntent({
      amount: price,
      currency: 'VND',
      metadata: {
        userId,
        planId,
        billingCycle,
        type: 'subscription',
      },
    });

    // Create user subscription record (status: PendingPayment)
    const subscription = await UserSubscriptionsRepository.create({
      userId,
      planId,
      status: 'PendingPayment',
      billingCycle,
      price,
      paymentIntentId: paymentIntent.id,
      entitlementsSnapshot: plan.entitlements,
    });

    res.status(201).json({
      id: subscription.id,
      planId,
      status: 'PendingPayment',
      price,
      clientSecret: paymentIntent.clientSecret, // For frontend to complete payment
    });

  } catch (error) {
    next(error);
  }
}
```

#### C. Stripe Webhook Handler

```javascript
// src/controllers/webhooks.controller.js

async function handleStripeWebhook(req, res, next) {
  try {
    const sig = req.headers['stripe-signature'];
    const paymentClient = new PaymentClient(paymentConfig);

    // 🔴 VERIFY: Stripe signature
    const event = paymentClient.constructWebhookEvent(req.body, sig);

    logger.info({ 
      type: event.type, 
      id: event.id 
    }, 'Stripe webhook received');

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailure(event.data.object);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionChange(event.data.object);
        break;

      default:
        logger.info({ type: event.type }, 'Unhandled webhook event');
    }

    res.status(200).json({ received: true });

  } catch (error) {
    logger.error({ error: error.message }, 'Webhook handling failed');
    res.status(400).json({ error: error.message });
  }
}

async function handlePaymentSuccess(paymentIntent) {
  const { id, metadata } = paymentIntent;
  const { userId, planId, billingCycle } = metadata;

  // Find pending subscription
  const subscription = await UserSubscriptionsRepository.findOne({
    userId,
    paymentIntentId: id,
    status: 'PendingPayment',
  });

  if (!subscription) {
    logger.warn({ paymentIntentId: id }, 'Subscription not found for payment');
    return;
  }

  // Calculate dates
  const startDate = new Date();
  const endDate = new Date(startDate);
  if (billingCycle === 'Yearly') {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }

  // Activate subscription
  await UserSubscriptionsRepository.update(subscription.id, {
    status: 'Active',
    startDate,
    endDate,
    renewalDate: endDate,
  });

  // Update user record
  await UsersRepository.update(userId, {
    subscriptionPlanId: planId,
    subscriptionStatus: 'Active',
    subscriptionRenewalDate: endDate,
  });

  // 🔴 NOTIFY: Send confirmation email
  const user = await UsersRepository.findById(userId);
  const plan = await SubscriptionPlansRepository.findById(planId);

  await enqueueEmail({
    to: user.email,
    templateId: 'subscriptionActivated',
    variables: {
      fullName: user.fullName,
      planName: plan.planName,
      renewalDate: endDate.toLocaleDateString(),
      price: subscription.price,
      entitlements: Object.values(plan.entitlements),
      appUrl: appBaseUrl,
    },
  });

  logger.info({ userId, subscriptionId: subscription.id }, 'Subscription activated');
}

async function handlePaymentFailure(paymentIntent) {
  const { id, metadata } = paymentIntent;
  
  // Update subscription to Failed
  await UserSubscriptionsRepository.updateByPaymentIntent(id, {
    status: 'Failed',
  });

  logger.warn({ paymentIntentId: id }, 'Payment failed');
}
```

#### Checklist

- [ ] List subscription plans endpoint
- [ ] Purchase subscription endpoint
- [ ] Check for existing active subscriptions
- [ ] Create Stripe Payment Intent
- [ ] Create user subscription record (PendingPayment)
- [ ] Implement Stripe webhook handler
- [ ] Verify Stripe signature
- [ ] Handle payment_intent.succeeded event
- [ ] Activate subscription
- [ ] Update user record
- [ ] Calculate subscription dates
- [ ] Send activation email
- [ ] Handle payment_intent.failed event
- [ ] Handle subscription lifecycle events
- [ ] Tests: Full subscription flow

---

## Testing Strategy

### Integration Tests
- [ ] Document upload → extraction → summary → ToC (end-to-end)
- [ ] Question generation → review request → expert assignment → completion
- [ ] Quiz attempt → scoring → commission calculation
- [ ] Subscription purchase → payment → activation

### Error Scenarios
- [ ] LLM API failures during generation
- [ ] Storage upload failures
- [ ] Payment failures
- [ ] Worker job retries & DLQ
- [ ] Concurrent validation requests (duplicate prevention)

---

**Tiếp tục với PHASE_3_INFRASTRUCTURE.md...**
