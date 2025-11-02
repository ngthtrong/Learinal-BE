const QuestionSet = require("../models/questionSet.model");
const Document = require("../models/document.model");
const Subject = require("../models/subject.model");

class SearchService {
  /**
   * Global search across question sets, documents, and subjects
   */
  async globalSearch(query, options = {}) {
    const { userId, page: _page = 1, pageSize = 20 } = options;
    const limit = Math.min(pageSize, 50); // Max 50 per type

    // Search in parallel
    const [questionSets, documents, subjects] = await Promise.all([
      this.searchQuestionSets(query, { userId, limit }),
      this.searchDocuments(query, { userId, limit }),
      this.searchSubjects(query, { userId, limit }),
    ]);

    return {
      questionSets,
      documents,
      subjects,
      total: questionSets.length + documents.length + subjects.length,
    };
  }

  /**
   * Search question sets by title, description
   */
  async searchQuestionSets(query, options = {}) {
    const { userId, limit = 20 } = options;

    const searchQuery = {
      $or: [
        { title: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } },
      ],
    };

    // If userId provided, filter by ownership or shared
    if (userId) {
      searchQuery.$and = [
        {
          $or: [{ creatorId: userId }, { isShared: true, status: "Published" }],
        },
      ];
    }

    const sets = await QuestionSet.find(searchQuery)
      .limit(limit)
      .select("title description status difficulty creatorId createdAt")
      .lean();

    return sets.map((set) => ({
      id: set._id.toString(),
      type: "QuestionSet",
      title: set.title,
      description: set.description,
      status: set.status,
      difficulty: set.difficulty,
      createdAt: set.createdAt,
    }));
  }

  /**
   * Search documents by name, content
   */
  async searchDocuments(query, options = {}) {
    const { userId, limit = 20 } = options;

    const searchQuery = {
      $or: [
        { fileName: { $regex: query, $options: "i" } },
        { summaryShort: { $regex: query, $options: "i" } },
        { summaryFull: { $regex: query, $options: "i" } },
      ],
    };

    if (userId) {
      searchQuery.ownerId = userId;
    }

    const docs = await Document.find(searchQuery)
      .limit(limit)
      .select("fileName mimeType status summaryShort ownerId createdAt")
      .lean();

    return docs.map((doc) => ({
      id: doc._id.toString(),
      type: "Document",
      title: doc.fileName,
      description: doc.summaryShort,
      status: doc.status,
      mimeType: doc.mimeType,
      createdAt: doc.createdAt,
    }));
  }

  /**
   * Search subjects by name
   */
  async searchSubjects(query, options = {}) {
    const { userId, limit = 20 } = options;

    const searchQuery = {
      subjectName: { $regex: query, $options: "i" },
    };

    if (userId) {
      searchQuery.ownerId = userId;
    }

    const subjects = await Subject.find(searchQuery)
      .limit(limit)
      .select("subjectName ownerId createdAt")
      .lean();

    return subjects.map((subject) => ({
      id: subject._id.toString(),
      type: "Subject",
      title: subject.subjectName,
      createdAt: subject.createdAt,
    }));
  }

  /**
   * Advanced question set filtering
   */
  async filterQuestionSets(filters, options = {}) {
    const { page = 1, pageSize = 20 } = options;
    const skip = (page - 1) * pageSize;

    const query = {};

    // Status filter
    if (filters.status) {
      query.status = filters.status;
    }

    // Difficulty filter
    if (filters.difficulty) {
      query.difficulty = filters.difficulty;
    }

    // Date range filter
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.createdAt.$lte = new Date(filters.endDate);
      }
    }

    // Creator filter
    if (filters.creatorId) {
      query.creatorId = filters.creatorId;
    }

    // Shared filter
    if (filters.isShared !== undefined) {
      query.isShared = filters.isShared === "true" || filters.isShared === true;
    }

    const [results, total] = await Promise.all([
      QuestionSet.find(query).skip(skip).limit(pageSize).sort({ createdAt: -1 }).lean(),
      QuestionSet.countDocuments(query),
    ]);

    return {
      results: results.map((set) => ({
        id: set._id.toString(),
        title: set.title,
        description: set.description,
        status: set.status,
        difficulty: set.difficulty,
        isShared: set.isShared,
        createdAt: set.createdAt,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}

module.exports = SearchService;
