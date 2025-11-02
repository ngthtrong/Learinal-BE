/**
 * @fileoverview Batch Operations Service
 * @description Handles bulk operations on multiple resources
 * Phase 3.2 - Production Features
 */

const QuestionSet = require("../models/questionSet.model");
const Document = require("../models/document.model");
const Subject = require("../models/subject.model");
const { AppError } = require("../utils/appError");

class BatchService {
  /**
   * Batch delete question sets
   * @param {string} userId - ID of user performing action
   * @param {string[]} ids - Array of question set IDs
   * @param {boolean} isAdmin - Whether user is admin (can delete any)
   * @returns {Promise<{deleted: number, errors: Array}>}
   */
  async deleteQuestionSets(userId, ids, isAdmin = false) {
    const results = {
      deleted: 0,
      errors: [],
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError("ids must be a non-empty array", 400);
    }

    if (ids.length > 100) {
      throw new AppError("Cannot delete more than 100 items at once", 400);
    }

    for (const id of ids) {
      try {
        const questionSet = await QuestionSet.findById(id);

        if (!questionSet) {
          results.errors.push({
            id,
            error: "Question set not found",
          });
          continue;
        }

        // Check ownership unless admin
        if (!isAdmin && questionSet.createdBy.toString() !== userId) {
          results.errors.push({
            id,
            error: "Permission denied",
          });
          continue;
        }

        // Prevent deletion if published (unless admin)
        if (questionSet.status === "published" && !isAdmin) {
          results.errors.push({
            id,
            error: "Cannot delete published question set",
          });
          continue;
        }

        await questionSet.deleteOne();
        results.deleted++;
      } catch (error) {
        results.errors.push({
          id,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Batch publish question sets
   * @param {string} userId - ID of user performing action (must be expert/admin)
   * @param {string[]} ids - Array of question set IDs
   * @returns {Promise<{published: number, errors: Array}>}
   */
  async publishQuestionSets(userId, ids) {
    const results = {
      published: 0,
      errors: [],
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError("ids must be a non-empty array", 400);
    }

    if (ids.length > 100) {
      throw new AppError("Cannot publish more than 100 items at once", 400);
    }

    for (const id of ids) {
      try {
        const questionSet = await QuestionSet.findById(id);

        if (!questionSet) {
          results.errors.push({
            id,
            error: "Question set not found",
          });
          continue;
        }

        // Check ownership
        if (questionSet.createdBy.toString() !== userId) {
          results.errors.push({
            id,
            error: "Permission denied",
          });
          continue;
        }

        // Check if already published
        if (questionSet.status === "published") {
          results.errors.push({
            id,
            error: "Already published",
          });
          continue;
        }

        // Validate has questions
        if (!questionSet.questions || questionSet.questions.length === 0) {
          results.errors.push({
            id,
            error: "Cannot publish empty question set",
          });
          continue;
        }

        questionSet.status = "published";
        questionSet.publishedAt = new Date();
        await questionSet.save();

        results.published++;
      } catch (error) {
        results.errors.push({
          id,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Batch unpublish question sets
   * @param {string} userId - ID of user performing action
   * @param {string[]} ids - Array of question set IDs
   * @param {boolean} isAdmin - Whether user is admin
   * @returns {Promise<{unpublished: number, errors: Array}>}
   */
  async unpublishQuestionSets(userId, ids, isAdmin = false) {
    const results = {
      unpublished: 0,
      errors: [],
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError("ids must be a non-empty array", 400);
    }

    if (ids.length > 100) {
      throw new AppError("Cannot unpublish more than 100 items at once", 400);
    }

    for (const id of ids) {
      try {
        const questionSet = await QuestionSet.findById(id);

        if (!questionSet) {
          results.errors.push({
            id,
            error: "Question set not found",
          });
          continue;
        }

        // Check ownership unless admin
        if (!isAdmin && questionSet.createdBy.toString() !== userId) {
          results.errors.push({
            id,
            error: "Permission denied",
          });
          continue;
        }

        // Check if already unpublished
        if (questionSet.status !== "published") {
          results.errors.push({
            id,
            error: "Not published",
          });
          continue;
        }

        questionSet.status = "draft";
        questionSet.publishedAt = null;
        await questionSet.save();

        results.unpublished++;
      } catch (error) {
        results.errors.push({
          id,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Batch update question sets (subject, difficulty, tags)
   * @param {string} userId - ID of user performing action
   * @param {string[]} ids - Array of question set IDs
   * @param {Object} updates - Fields to update {subject?, difficulty?, tags?}
   * @param {boolean} isAdmin - Whether user is admin
   * @returns {Promise<{updated: number, errors: Array}>}
   */
  async updateQuestionSets(userId, ids, updates, isAdmin = false) {
    const results = {
      updated: 0,
      errors: [],
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError("ids must be a non-empty array", 400);
    }

    if (ids.length > 100) {
      throw new AppError("Cannot update more than 100 items at once", 400);
    }

    if (!updates || Object.keys(updates).length === 0) {
      throw new AppError("No updates provided", 400);
    }

    // Only allow certain fields
    const allowedFields = ["subject", "difficulty", "tags"];
    const updateFields = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateFields[field] = updates[field];
      }
    }

    if (Object.keys(updateFields).length === 0) {
      throw new AppError(
        `Only ${allowedFields.join(", ")} can be batch updated`,
        400
      );
    }

    // Validate subject if provided
    if (updateFields.subject) {
      const subject = await Subject.findById(updateFields.subject);
      if (!subject) {
        throw new AppError("Subject not found", 404);
      }
    }

    // Validate difficulty if provided
    if (updateFields.difficulty) {
      const validDifficulties = ["easy", "medium", "hard"];
      if (!validDifficulties.includes(updateFields.difficulty)) {
        throw new AppError(
          `Difficulty must be one of: ${validDifficulties.join(", ")}`,
          400
        );
      }
    }

    for (const id of ids) {
      try {
        const questionSet = await QuestionSet.findById(id);

        if (!questionSet) {
          results.errors.push({
            id,
            error: "Question set not found",
          });
          continue;
        }

        // Check ownership unless admin
        if (!isAdmin && questionSet.createdBy.toString() !== userId) {
          results.errors.push({
            id,
            error: "Permission denied",
          });
          continue;
        }

        // Apply updates
        Object.assign(questionSet, updateFields);
        await questionSet.save();

        results.updated++;
      } catch (error) {
        results.errors.push({
          id,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Batch delete documents
   * @param {string} userId - ID of user performing action
   * @param {string[]} ids - Array of document IDs
   * @param {boolean} isAdmin - Whether user is admin
   * @returns {Promise<{deleted: number, errors: Array}>}
   */
  async deleteDocuments(userId, ids, isAdmin = false) {
    const results = {
      deleted: 0,
      errors: [],
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError("ids must be a non-empty array", 400);
    }

    if (ids.length > 100) {
      throw new AppError("Cannot delete more than 100 items at once", 400);
    }

    for (const id of ids) {
      try {
        const document = await Document.findById(id);

        if (!document) {
          results.errors.push({
            id,
            error: "Document not found",
          });
          continue;
        }

        // Check ownership unless admin
        if (!isAdmin && document.uploadedBy.toString() !== userId) {
          results.errors.push({
            id,
            error: "Permission denied",
          });
          continue;
        }

        // Note: In production, should also delete file from storage
        // storageClient.deleteFile(document.filePath)

        await document.deleteOne();
        results.deleted++;
      } catch (error) {
        results.errors.push({
          id,
          error: error.message,
        });
      }
    }

    return results;
  }
}

module.exports = new BatchService();
