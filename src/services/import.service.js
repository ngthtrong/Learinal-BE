/**
 * @fileoverview Import Service
 * @description Handles importing question sets from JSON format
 * Phase 3.3 - Production Features
 */

const QuestionSet = require("../models/questionSet.model");
const Subject = require("../models/subject.model");
const { AppError } = require("../utils/appError");

class ImportService {
  /**
   * Import question set from JSON
   * @param {Object} jsonData - JSON data to import
   * @param {string} userId - ID of user performing import
   * @returns {Promise<Object>} Created question set
   */
  async importFromJSON(jsonData, userId) {
    // Validate JSON structure
    this._validateImportJSON(jsonData);

    const data = jsonData.questionSet || jsonData;

    // Validate subject exists or create new
    let subjectId = null;
    if (data.subject) {
      if (data.subject.id) {
        const subject = await Subject.findById(data.subject.id);
        if (subject) {
          subjectId = subject._id;
        }
      }

      // If subject not found by ID, try to find by name or create new
      if (!subjectId && data.subject.name) {
        let subject = await Subject.findOne({
          name: data.subject.name,
          createdBy: userId,
        });

        if (!subject) {
          subject = await Subject.create({
            name: data.subject.name,
            description: data.subject.description || "",
            createdBy: userId,
          });
        }

        subjectId = subject._id;
      }
    }

    // Validate questions
    if (!data.questions || !Array.isArray(data.questions)) {
      throw new AppError("Invalid questions array", 400);
    }

    if (data.questions.length === 0) {
      throw new AppError("Cannot import empty question set", 400);
    }

    if (data.questions.length > 100) {
      throw new AppError("Cannot import more than 100 questions at once", 400);
    }

    // Validate each question
    const validatedQuestions = data.questions.map((q, index) => {
      if (!q.questionText || !q.questionType) {
        throw new AppError(
          `Question ${index + 1}: questionText and questionType are required`,
          400
        );
      }

      const validTypes = ["multiple-choice", "true-false", "short-answer"];
      if (!validTypes.includes(q.questionType)) {
        throw new AppError(
          `Question ${index + 1}: questionType must be one of: ${validTypes.join(", ")}`,
          400
        );
      }

      // Validate multiple-choice has options
      if (q.questionType === "multiple-choice") {
        if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
          throw new AppError(
            `Question ${index + 1}: multiple-choice must have at least 2 options`,
            400
          );
        }
      }

      return {
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options || [],
        correctAnswer: q.correctAnswer || "",
        explanation: q.explanation || "",
        difficulty: q.difficulty || "medium",
        points: q.points || 1,
      };
    });

    // Create new question set
    const questionSet = await QuestionSet.create({
      title: data.title || "Imported Question Set",
      description: data.description || "",
      subject: subjectId,
      difficulty: data.difficulty || "medium",
      estimatedTime: data.estimatedTime || null,
      tags: data.tags || [],
      questions: validatedQuestions,
      status: "draft", // Always import as draft
      createdBy: userId,
    });

    return questionSet;
  }

  /**
   * Import multiple question sets from batch JSON
   * @param {Object} jsonData - Batch JSON data
   * @param {string} userId - ID of user performing import
   * @returns {Promise<Object>} Import results
   */
  async batchImportFromJSON(jsonData, userId) {
    // Validate batch structure
    if (!jsonData.questionSets || !Array.isArray(jsonData.questionSets)) {
      throw new AppError("Invalid batch format: questionSets array required", 400);
    }

    if (jsonData.questionSets.length === 0) {
      throw new AppError("No question sets to import", 400);
    }

    if (jsonData.questionSets.length > 20) {
      throw new AppError("Cannot import more than 20 question sets at once", 400);
    }

    const results = {
      imported: 0,
      errors: [],
      questionSets: [],
    };

    for (const [index, qsData] of jsonData.questionSets.entries()) {
      try {
        // Wrap in same structure as single import
        const wrappedData = { questionSet: qsData };
        const questionSet = await this.importFromJSON(wrappedData, userId);
        
        results.questionSets.push({
          id: questionSet._id,
          title: questionSet.title,
        });
        results.imported++;
      } catch (error) {
        results.errors.push({
          index: index + 1,
          title: qsData.title || `Question Set ${index + 1}`,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Import from CSV (basic implementation)
   * @param {string} csvContent - CSV string content
   * @param {string} userId - ID of user performing import
   * @param {Object} metadata - Additional metadata (title, subject, etc.)
   * @returns {Promise<Object>} Created question set
   */
  async importFromCSV(csvContent, userId, metadata = {}) {
    if (!csvContent || typeof csvContent !== "string") {
      throw new AppError("Invalid CSV content", 400);
    }

    // Parse CSV
    const lines = csvContent.split("\n").filter((line) => line.trim());

    if (lines.length < 2) {
      throw new AppError("CSV must have at least header and one question", 400);
    }

    // Skip header row
    const questionRows = lines.slice(1);

    const questions = questionRows.map((line, index) => {
      const cols = this._parseCSVLine(line);

      if (cols.length < 8) {
        throw new AppError(
          `Row ${index + 2}: Invalid CSV format - expected at least 8 columns`,
          400
        );
      }

      const questionText = cols[1]?.trim();
      const questionType = cols[2]?.trim() || "multiple-choice";
      const options = [cols[3], cols[4], cols[5], cols[6]].filter((opt) => opt?.trim());
      const correctAnswer = cols[7]?.trim();
      const explanation = cols[8]?.trim() || "";
      const difficulty = cols[9]?.trim() || "medium";
      const points = parseInt(cols[10]) || 1;

      if (!questionText) {
        throw new AppError(`Row ${index + 2}: Question text is required`, 400);
      }

      return {
        questionText,
        questionType,
        options,
        correctAnswer,
        explanation,
        difficulty,
        points,
      };
    });

    // Create question set with CSV data
    const jsonData = {
      questionSet: {
        title: metadata.title || "Imported from CSV",
        description: metadata.description || "",
        subject: metadata.subject,
        difficulty: metadata.difficulty || "medium",
        tags: metadata.tags || [],
        questions,
      },
    };

    return this.importFromJSON(jsonData, userId);
  }

  /**
   * Validate import JSON structure
   * @private
   */
  _validateImportJSON(jsonData) {
    if (!jsonData || typeof jsonData !== "object") {
      throw new AppError("Invalid JSON format", 400);
    }

    // Accept both wrapped and direct formats
    const data = jsonData.questionSet || jsonData;

    if (!data.title) {
      throw new AppError("Question set title is required", 400);
    }

    if (!data.questions) {
      throw new AppError("Questions array is required", 400);
    }
  }

  /**
   * Parse CSV line handling quotes and commas
   * @private
   */
  _parseCSVLine(line) {
    const cols = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        // End of column
        cols.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    // Add last column
    cols.push(current);

    return cols;
  }
}

module.exports = new ImportService();
