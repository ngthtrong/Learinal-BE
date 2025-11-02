/**
 * @fileoverview Export Service
 * @description Handles exporting question sets to JSON, CSV, and PDF formats
 * Phase 3.3 - Production Features
 */

const QuestionSet = require("../models/questionSet.model");
const User = require("../models/user.model");
const Subject = require("../models/subject.model");
const { AppError } = require("../utils/appError");

class ExportService {
  /**
   * Export question set to JSON format
   * @param {string} questionSetId - ID of question set to export
   * @param {string} userId - ID of user performing export
   * @returns {Promise<Object>} JSON representation of question set
   */
  async exportToJSON(questionSetId, userId) {
    const questionSet = await this._getQuestionSetWithAccess(
      questionSetId,
      userId
    );

    // Populate related data
    await questionSet.populate("createdBy", "fullName email");
    await questionSet.populate("subject", "name description");

    // Build export object
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        exportedBy: userId,
        version: "1.0",
        format: "learinal-question-set",
      },
      questionSet: {
        id: questionSet._id,
        title: questionSet.title,
        description: questionSet.description,
        subject: {
          id: questionSet.subject?._id,
          name: questionSet.subject?.name,
        },
        difficulty: questionSet.difficulty,
        estimatedTime: questionSet.estimatedTime,
        tags: questionSet.tags,
        questions: questionSet.questions.map((q) => ({
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          difficulty: q.difficulty,
          points: q.points,
        })),
        totalQuestions: questionSet.questions.length,
        status: questionSet.status,
        createdBy: {
          id: questionSet.createdBy?._id,
          fullName: questionSet.createdBy?.fullName,
        },
        createdAt: questionSet.createdAt,
      },
    };

    return exportData;
  }

  /**
   * Export question set to CSV format
   * @param {string} questionSetId - ID of question set to export
   * @param {string} userId - ID of user performing export
   * @returns {Promise<string>} CSV string
   */
  async exportToCSV(questionSetId, userId) {
    const questionSet = await this._getQuestionSetWithAccess(
      questionSetId,
      userId
    );

    // Build CSV manually (simple approach)
    const rows = [];

    // Header row
    rows.push([
      "Question Number",
      "Question Text",
      "Type",
      "Option A",
      "Option B",
      "Option C",
      "Option D",
      "Correct Answer",
      "Explanation",
      "Difficulty",
      "Points",
    ]);

    // Question rows
    questionSet.questions.forEach((q, index) => {
      const optionA = q.options?.[0] || "";
      const optionB = q.options?.[1] || "";
      const optionC = q.options?.[2] || "";
      const optionD = q.options?.[3] || "";

      rows.push([
        index + 1,
        this._escapeCSV(q.questionText),
        q.questionType,
        this._escapeCSV(optionA),
        this._escapeCSV(optionB),
        this._escapeCSV(optionC),
        this._escapeCSV(optionD),
        q.correctAnswer,
        this._escapeCSV(q.explanation || ""),
        q.difficulty || "",
        q.points || 1,
      ]);
    });

    // Convert to CSV string
    const csv = rows.map((row) => row.join(",")).join("\n");

    return csv;
  }

  /**
   * Export question set to PDF format (metadata)
   * Returns info needed to generate PDF on client/worker
   * @param {string} questionSetId - ID of question set to export
   * @param {string} userId - ID of user performing export
   * @returns {Promise<Object>} PDF generation data
   */
  async exportToPDF(questionSetId, userId) {
    const questionSet = await this._getQuestionSetWithAccess(
      questionSetId,
      userId
    );

    await questionSet.populate("createdBy", "fullName");
    await questionSet.populate("subject", "name");

    // Return structured data for PDF generation
    // Actual PDF rendering should be done by a worker or client-side library
    return {
      title: questionSet.title,
      description: questionSet.description,
      subject: questionSet.subject?.name || "N/A",
      difficulty: questionSet.difficulty,
      estimatedTime: questionSet.estimatedTime,
      createdBy: questionSet.createdBy?.fullName || "Unknown",
      createdAt: questionSet.createdAt,
      questions: questionSet.questions.map((q, index) => ({
        number: index + 1,
        text: q.questionText,
        type: q.questionType,
        options: q.options || [],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        points: q.points,
      })),
      totalQuestions: questionSet.questions.length,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Batch export multiple question sets to JSON
   * @param {string[]} questionSetIds - Array of question set IDs
   * @param {string} userId - ID of user performing export
   * @returns {Promise<Object>} Combined JSON export
   */
  async batchExportToJSON(questionSetIds, userId) {
    if (!Array.isArray(questionSetIds) || questionSetIds.length === 0) {
      throw new AppError("questionSetIds must be a non-empty array", 400);
    }

    if (questionSetIds.length > 50) {
      throw new AppError("Cannot export more than 50 items at once", 400);
    }

    const exports = [];
    const errors = [];

    for (const id of questionSetIds) {
      try {
        const exportData = await this.exportToJSON(id, userId);
        exports.push(exportData.questionSet);
      } catch (error) {
        errors.push({
          id,
          error: error.message,
        });
      }
    }

    return {
      metadata: {
        exportedAt: new Date().toISOString(),
        exportedBy: userId,
        version: "1.0",
        format: "learinal-question-sets-batch",
        totalExported: exports.length,
        totalErrors: errors.length,
      },
      questionSets: exports,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Helper: Get question set and verify access
   * @private
   */
  async _getQuestionSetWithAccess(questionSetId, userId) {
    const questionSet = await QuestionSet.findById(questionSetId);

    if (!questionSet) {
      throw new AppError("Question set not found", 404);
    }

    // Check access: owner or published
    const isOwner = questionSet.createdBy.toString() === userId;
    const isPublished = questionSet.status === "published";

    if (!isOwner && !isPublished) {
      throw new AppError(
        "You don't have permission to export this question set",
        403
      );
    }

    return questionSet;
  }

  /**
   * Helper: Escape CSV special characters
   * @private
   */
  _escapeCSV(str) {
    if (!str) return "";
    
    const stringValue = String(str);
    
    // If contains comma, quote, or newline, wrap in quotes and escape quotes
    if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
  }
}

module.exports = new ExportService();
