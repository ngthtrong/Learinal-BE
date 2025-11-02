# Phase 3: Production Features

**Timeline:** 3 tuần  
**Priority:** MEDIUM (can deploy incrementally)  
**Dependencies:** Phase 1, 2

---

## 📋 Tổng quan

Phase này bổ sung **các tính năng nâng cao** không có trong MVP:

### Scope
1. **Advanced Search & Filtering** (0.5 tuần)
2. **Batch Operations** (0.5 tuần)
3. **Export/Import Functionality** (0.5 tuần)
4. **Real-time Notifications** (1 tuần)
5. **File Versioning & History** (0.5 tuần)
6. **Collaboration Features** (1 tuần - optional)

---

## 1️⃣ Advanced Search & Filtering

### 1.1. Full-text Search

**Dependencies:**
```bash
npm install mongodb-full-text-search
# Or use MongoDB Atlas Search (recommended)
```

**File:** `src/services/search.service.js`

```javascript
class SearchService {
  constructor({
    questionSetsRepository,
    documentsRepository,
    subjectsRepository,
  }) {
    this.questionSetsRepo = questionSetsRepository;
    this.documentsRepo = documentsRepository;
    this.subjectsRepo = subjectsRepository;
  }

  /**
   * Global search across question sets, documents, subjects
   */
  async globalSearch(query, options = {}) {
    const { userId, page = 1, pageSize = 20 } = options;

    // Search in question sets
    const questionSets = await this.searchQuestionSets(query, {
      userId,
      limit: 5,
    });

    // Search in documents
    const documents = await this.searchDocuments(query, {
      userId,
      limit: 5,
    });

    // Search in subjects
    const subjects = await this.searchSubjects(query, {
      userId,
      limit: 5,
    });

    return {
      questionSets,
      documents,
      subjects,
      query,
    };
  }

  async searchQuestionSets(query, options = {}) {
    const { userId, limit = 20 } = options;

    const filter = {
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { 'questions.questionText': { $regex: query, $options: 'i' } },
      ],
    };

    if (userId) {
      filter.$and = [
        {
          $or: [
            { creatorId: userId },
            { status: 'Published' },
            { status: 'Validated' },
          ],
        },
      ];
    }

    const sets = await this.questionSetsRepo.find(filter, {
      limit,
      sort: { createdAt: -1 },
    });

    return sets.map(this.mapQuestionSetToDTO);
  }

  async searchDocuments(query, options = {}) {
    const { userId, limit = 20 } = options;

    const filter = {
      $or: [
        { originalFileName: { $regex: query, $options: 'i' } },
        { extractedText: { $regex: query, $options: 'i' } },
        { summaryShort: { $regex: query, $options: 'i' } },
      ],
    };

    if (userId) {
      filter.ownerId = userId;
    }

    const docs = await this.documentsRepo.find(filter, {
      limit,
      sort: { uploadedAt: -1 },
    });

    return docs.map(this.mapDocumentToDTO);
  }

  async searchSubjects(query, options = {}) {
    const { userId, limit = 20 } = options;

    const filter = {
      $or: [
        { subjectName: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { summary: { $regex: query, $options: 'i' } },
      ],
    };

    if (userId) {
      filter.userId = userId;
    }

    const subjects = await this.subjectsRepo.find(filter, {
      limit,
      sort: { createdAt: -1 },
    });

    return subjects.map(this.mapSubjectToDTO);
  }

  // DTOs...
}

module.exports = SearchService;
```

---

### 1.2. Advanced Filtering

**File:** `src/utils/queryBuilder.js`

```javascript
/**
 * Build complex MongoDB query from request params
 */
class QueryBuilder {
  constructor(model, queryParams) {
    this.model = model;
    this.queryParams = queryParams;
    this.query = null;
  }

  filter() {
    const queryObj = { ...this.queryParams };
    
    // Remove special fields
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach((el) => delete queryObj[el]);

    // Advanced filtering
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);

    this.query = this.model.find(JSON.parse(queryStr));
    return this;
  }

  sort() {
    if (this.queryParams.sort) {
      const sortBy = this.queryParams.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort('-createdAt');
    }
    return this;
  }

  limitFields() {
    if (this.queryParams.fields) {
      const fields = this.queryParams.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    }
    return this;
  }

  paginate() {
    const page = this.queryParams.page * 1 || 1;
    const limit = this.queryParams.limit * 1 || 20;
    const skip = (page - 1) * limit;

    this.query = this.query.skip(skip).limit(limit);
    return this;
  }

  async execute() {
    return await this.query;
  }
}

module.exports = QueryBuilder;
```

**Usage example:**

```javascript
// In controller
const QueryBuilder = require('../utils/queryBuilder');

async list(req, res, next) {
  try {
    const features = new QueryBuilder(QuestionSet, req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const sets = await features.execute();
    const total = await QuestionSet.countDocuments();

    res.status(200).json({
      items: sets,
      meta: {
        page: req.query.page * 1 || 1,
        pageSize: sets.length,
        total,
      },
    });
  } catch (error) {
    next(error);
  }
}
```

---

## 2️⃣ Batch Operations

### 2.1. Batch Controller

**File:** `src/controllers/batch.controller.js`

```javascript
const BatchService = require('../services/batch.service');

class BatchController {
  constructor({ batchService }) {
    this.service = batchService;
  }

  /**
   * POST /batch/question-sets/delete
   * Delete multiple question sets
   */
  async deleteQuestionSets(req, res, next) {
    try {
      const { ids } = req.body;
      const userId = req.user.id;

      const result = await this.service.deleteQuestionSets(ids, userId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /batch/question-sets/publish
   * Publish multiple question sets
   */
  async publishQuestionSets(req, res, next) {
    try {
      const { ids } = req.body;
      const userId = req.user.id;

      const result = await this.service.publishQuestionSets(ids, userId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /batch/documents/delete
   * Delete multiple documents
   */
  async deleteDocuments(req, res, next) {
    try {
      const { ids } = req.body;
      const userId = req.user.id;

      const result = await this.service.deleteDocuments(ids, userId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = BatchController;
```

---

### 2.2. Batch Service

**File:** `src/services/batch.service.js`

```javascript
class BatchService {
  constructor({
    questionSetsRepository,
    documentsRepository,
    storageClient,
    eventBus,
  }) {
    this.questionSetsRepo = questionSetsRepository;
    this.documentsRepo = documentsRepository;
    this.storageClient = storageClient;
    this.eventBus = eventBus;
  }

  async deleteQuestionSets(ids, userId) {
    const results = {
      deleted: [],
      failed: [],
    };

    for (const id of ids) {
      try {
        const set = await this.questionSetsRepo.findById(id);

        if (!set || set.creatorId.toString() !== userId) {
          results.failed.push({
            id,
            reason: 'Not found or not owner',
          });
          continue;
        }

        await this.questionSetsRepo.delete(id);
        results.deleted.push(id);

        await this.eventBus.publish('questionSet.deleted', {
          setId: id,
          userId,
        });
      } catch (error) {
        results.failed.push({
          id,
          reason: error.message,
        });
      }
    }

    return results;
  }

  async publishQuestionSets(ids, userId) {
    const results = {
      published: [],
      failed: [],
    };

    for (const id of ids) {
      try {
        const set = await this.questionSetsRepo.findById(id);

        if (!set || set.creatorId.toString() !== userId) {
          results.failed.push({
            id,
            reason: 'Not found or not owner',
          });
          continue;
        }

        if (set.status !== 'Validated') {
          results.failed.push({
            id,
            reason: 'Only validated sets can be published',
          });
          continue;
        }

        await this.questionSetsRepo.update(id, {
          status: 'Published',
        });

        results.published.push(id);
      } catch (error) {
        results.failed.push({
          id,
          reason: error.message,
        });
      }
    }

    return results;
  }

  async deleteDocuments(ids, userId) {
    const results = {
      deleted: [],
      failed: [],
    };

    for (const id of ids) {
      try {
        const doc = await this.documentsRepo.findById(id);

        if (!doc || doc.ownerId.toString() !== userId) {
          results.failed.push({
            id,
            reason: 'Not found or not owner',
          });
          continue;
        }

        // Delete from storage
        if (doc.storagePath) {
          await this.storageClient.delete(doc.storagePath);
        }

        // Delete from database
        await this.documentsRepo.delete(id);
        results.deleted.push(id);

        await this.eventBus.publish('document.deleted', {
          documentId: id,
          userId,
        });
      } catch (error) {
        results.failed.push({
          id,
          reason: error.message,
        });
      }
    }

    return results;
  }
}

module.exports = BatchService;
```

---

## 3️⃣ Export/Import Functionality

### 3.1. Export Question Sets

**File:** `src/controllers/export.controller.js`

```javascript
const ExportService = require('../services/export.service');

class ExportController {
  constructor({ exportService }) {
    this.service = exportService;
  }

  /**
   * GET /question-sets/:id/export
   * Export question set as JSON, CSV, or PDF
   */
  async exportQuestionSet(req, res, next) {
    try {
      const { id } = req.params;
      const { format = 'json' } = req.query;
      const userId = req.user.id;

      const result = await this.service.exportQuestionSet(id, userId, format);

      res.setHeader('Content-Type', result.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`
      );
      res.send(result.data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /question-sets/import
   * Import question set from file
   */
  async importQuestionSet(req, res, next) {
    try {
      const userId = req.user.id;
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          code: 'ValidationError',
          message: 'No file uploaded',
        });
      }

      const questionSet = await this.service.importQuestionSet(file, userId);

      res.status(201).json(questionSet);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ExportController;
```

---

### 3.2. Export Service

**File:** `src/services/export.service.js`

```javascript
const json2csv = require('json2csv').parse;

class ExportService {
  constructor({ questionSetsRepository }) {
    this.questionSetsRepo = questionSetsRepository;
  }

  async exportQuestionSet(setId, userId, format) {
    const set = await this.questionSetsRepo.findById(setId);

    if (!set) {
      throw new Error('Question set not found');
    }

    // Check access
    if (
      set.creatorId.toString() !== userId &&
      set.status !== 'Published' &&
      set.status !== 'Validated'
    ) {
      throw new Error('No access to this question set');
    }

    switch (format) {
      case 'json':
        return this.exportAsJSON(set);
      case 'csv':
        return this.exportAsCSV(set);
      case 'pdf':
        return this.exportAsPDF(set);
      default:
        throw new Error('Unsupported export format');
    }
  }

  exportAsJSON(set) {
    const data = {
      title: set.title,
      description: set.description,
      questions: set.questions.map((q) => ({
        questionText: q.questionText,
        options: q.options,
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation,
        difficultyLevel: q.difficultyLevel,
        topicTags: q.topicTags,
      })),
    };

    return {
      data: JSON.stringify(data, null, 2),
      contentType: 'application/json',
      filename: `${set.title || 'questions'}.json`,
    };
  }

  exportAsCSV(set) {
    const fields = [
      'questionText',
      'option1',
      'option2',
      'option3',
      'option4',
      'correctAnswer',
      'explanation',
      'difficultyLevel',
    ];

    const data = set.questions.map((q) => ({
      questionText: q.questionText,
      option1: q.options[0] || '',
      option2: q.options[1] || '',
      option3: q.options[2] || '',
      option4: q.options[3] || '',
      correctAnswer: q.options[q.correctAnswerIndex] || '',
      explanation: q.explanation || '',
      difficultyLevel: q.difficultyLevel,
    }));

    const csv = json2csv(data, { fields });

    return {
      data: csv,
      contentType: 'text/csv',
      filename: `${set.title || 'questions'}.csv`,
    };
  }

  exportAsPDF(set) {
    // Implement PDF generation (use libraries like pdfkit or puppeteer)
    throw new Error('PDF export not implemented yet');
  }

  async importQuestionSet(file, userId) {
    const content = file.buffer.toString('utf8');
    const data = JSON.parse(content);

    // Validate structure
    if (!data.questions || !Array.isArray(data.questions)) {
      throw new Error('Invalid question set format');
    }

    // Create question set
    const set = await this.questionSetsRepo.create({
      title: data.title || 'Imported Question Set',
      description: data.description || '',
      creatorId: userId,
      questions: data.questions,
      status: 'Draft',
    });

    return set;
  }
}

module.exports = ExportService;
```

---

## 4️⃣ Real-time Notifications (WebSocket)

### 4.1. WebSocket Setup

**Dependencies:**
```bash
npm install socket.io
```

**File:** `src/websocket/index.js`

```javascript
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');

class WebSocketServer {
  constructor(httpServer) {
    this.io = socketIo(httpServer, {
      cors: {
        origin: process.env.CORS_ALLOWED_ORIGINS.split(','),
        methods: ['GET', 'POST'],
      },
    });

    this.setupMiddleware();
    this.setupHandlers();
  }

  setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, config.jwtSecret);
        socket.userId = decoded.userId;
        socket.role = decoded.role;

        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });
  }

  setupHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`User connected: ${socket.userId}`);

      // Join user-specific room
      socket.join(`user:${socket.userId}`);

      // Join role-specific room
      socket.join(`role:${socket.role}`);

      socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.userId}`);
      });
    });
  }

  // Emit to specific user
  emitToUser(userId, event, data) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  // Emit to all users with specific role
  emitToRole(role, event, data) {
    this.io.to(`role:${role}`).emit(event, data);
  }

  // Broadcast to all
  broadcast(event, data) {
    this.io.emit(event, data);
  }
}

module.exports = WebSocketServer;
```

---

### 4.2. Integrate with Server

**File:** `src/server.js`

```javascript
const http = require('http');
const app = require('./app');
const WebSocketServer = require('./websocket');
const config = require('./config');

const server = http.createServer(app);

// Initialize WebSocket
const wsServer = new WebSocketServer(server);

// Make wsServer available globally
global.wsServer = wsServer;

server.listen(config.port, () => {
  console.log(`✅ Server running on port ${config.port}`);
});
```

---

### 4.3. Emit Real-time Notifications

**File:** `src/jobs/review.assigned.js` (example)

```javascript
// After assigning expert...

// Send in-app notification via WebSocket
if (global.wsServer) {
  global.wsServer.emitToUser(expert._id.toString(), 'validation.assigned', {
    requestId,
    setTitle: questionSet.title,
    numQuestions: questionSet.questions.length,
  });

  global.wsServer.emitToUser(learnerId, 'validation.accepted', {
    requestId,
    expertName: expert.fullName,
  });
}
```

---

## 5️⃣ File Versioning & History

### 5.1. Document Version Model

**File:** `src/models/documentVersion.model.js`

```javascript
const mongoose = require('mongoose');

const documentVersionSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
    version: {
      type: Number,
      required: true,
    },
    storagePath: String,
    fileSize: Number,
    extractedText: String,
    changes: String, // Description of changes
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

documentVersionSchema.index({ documentId: 1, version: -1 });

module.exports = mongoose.model('DocumentVersion', documentVersionSchema);
```

---

## 6️⃣ Collaboration Features (Optional)

### 6.1. Shared Question Sets

**Model update:** Add collaborators to QuestionSet

```javascript
// In questionSet.model.js
collaborators: [{
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  permission: {
    type: String,
    enum: ['View', 'Edit'],
    default: 'View',
  },
  addedAt: Date,
}],
```

---

### 6.2. Comments on Questions

**Model:** `src/models/comment.model.js`

```javascript
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ['QuestionSet', 'Question'],
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    parentCommentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

commentSchema.index({ entityType: 1, entityId: 1 });

module.exports = mongoose.model('Comment', commentSchema);
```

---

## ✅ Acceptance Criteria - Phase 3

### Search & Filtering
- [ ] Global search working
- [ ] Advanced filters (date, status, difficulty)
- [ ] Full-text search on content
- [ ] Search results relevance

### Batch Operations
- [ ] Batch delete working
- [ ] Batch publish working
- [ ] Batch status update
- [ ] Error handling for partial failures

### Export/Import
- [ ] Export as JSON working
- [ ] Export as CSV working
- [ ] Import from JSON working
- [ ] Data validation on import

### Real-time Notifications
- [ ] WebSocket connection working
- [ ] Real-time updates for validation
- [ ] Real-time updates for quiz
- [ ] Connection recovery

### File Versioning
- [ ] Document versions tracked
- [ ] Version history accessible
- [ ] Rollback to previous version

### Collaboration (Optional)
- [ ] Share question sets with others
- [ ] Comment on questions
- [ ] Collaborative editing

---

**Timeline:** 3 tuần  
**Next:** Phase 4 - Production Hardening
