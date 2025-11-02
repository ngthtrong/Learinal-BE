/**
 * @fileoverview Export/Import Controller
 * @description HTTP handlers for export and import operations
 * Phase 3.3 - Production Features
 */

const exportService = require("../services/export.service");
const importService = require("../services/import.service");

// ============= EXPORT ENDPOINTS =============

/**
 * @route GET /api/v1/export/question-sets/:id/json
 * @access Private
 */
exports.exportQuestionSetJSON = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const jsonData = await exportService.exportToJSON(id, userId);

    res.status(200).json({
      success: true,
      data: jsonData,
      exportTracking: req.exportTracking,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/v1/export/question-sets/:id/csv
 * @access Private
 */
exports.exportQuestionSetCSV = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const csvData = await exportService.exportToCSV(id, userId);

    // Set headers for CSV download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="question-set-${id}.csv"`
    );

    res.status(200).send(csvData);
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/v1/export/question-sets/:id/pdf
 * @access Private
 */
exports.exportQuestionSetPDF = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const pdfData = await exportService.exportToPDF(id, userId);

    res.status(200).json({
      success: true,
      data: pdfData,
      message:
        "PDF generation data ready. Use a PDF library on client-side to render.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/v1/export/question-sets/batch
 * @access Private
 */
exports.batchExportQuestionSets = async (req, res, next) => {
  try {
    const { ids, format = "json" } = req.body;
    const userId = req.user.id;

    if (format !== "json") {
      return res.status(400).json({
        success: false,
        message: "Only JSON format is supported for batch export",
      });
    }

    const exportData = await exportService.batchExportToJSON(ids, userId);

    res.status(200).json({
      success: true,
      data: exportData,
      message: `Exported ${exportData.metadata.totalExported} question set(s)`,
      exportTracking: req.exportTracking,
    });
  } catch (error) {
    next(error);
  }
};

// ============= IMPORT ENDPOINTS =============

/**
 * @route POST /api/v1/import/question-sets/json
 * @access Private
 */
exports.importQuestionSetJSON = async (req, res, next) => {
  try {
    const jsonData = req.body;
    const userId = req.user.id;

    const questionSet = await importService.importFromJSON(jsonData, userId);

    res.status(201).json({
      success: true,
      data: questionSet,
      message: "Question set imported successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/v1/import/question-sets/batch
 * @access Private
 */
exports.batchImportQuestionSets = async (req, res, next) => {
  try {
    const jsonData = req.body;
    const userId = req.user.id;

    const results = await importService.batchImportFromJSON(jsonData, userId);

    res.status(201).json({
      success: true,
      data: results,
      message: `Imported ${results.imported} question set(s)`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/v1/import/question-sets/csv
 * @access Private
 */
exports.importQuestionSetCSV = async (req, res, next) => {
  try {
    const { csvContent, metadata } = req.body;
    const userId = req.user.id;

    if (!csvContent) {
      return res.status(400).json({
        success: false,
        message: "csvContent is required",
      });
    }

    const questionSet = await importService.importFromCSV(
      csvContent,
      userId,
      metadata || {}
    );

    res.status(201).json({
      success: true,
      data: questionSet,
      message: "Question set imported from CSV successfully",
    });
  } catch (error) {
    next(error);
  }
};
