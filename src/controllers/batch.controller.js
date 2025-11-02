/**
 * @fileoverview Batch Operations Controller
 * @description HTTP handlers for bulk operations
 * Phase 3.2 - Production Features
 */

const batchService = require("../services/batch.service");

/**
 * @route POST /api/v1/batch/question-sets/delete
 * @access Private (Expert/Admin)
 */
exports.batchDeleteQuestionSets = async (req, res, next) => {
  try {
    const { ids } = req.body;
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";

    const results = await batchService.deleteQuestionSets(
      userId,
      ids,
      isAdmin
    );

    res.status(200).json({
      success: true,
      data: results,
      message: `Deleted ${results.deleted} question set(s)`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/v1/batch/question-sets/publish
 * @access Private (Expert/Admin)
 */
exports.batchPublishQuestionSets = async (req, res, next) => {
  try {
    const { ids } = req.body;
    const userId = req.user.id;

    const results = await batchService.publishQuestionSets(userId, ids);

    res.status(200).json({
      success: true,
      data: results,
      message: `Published ${results.published} question set(s)`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/v1/batch/question-sets/unpublish
 * @access Private (Expert/Admin)
 */
exports.batchUnpublishQuestionSets = async (req, res, next) => {
  try {
    const { ids } = req.body;
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";

    const results = await batchService.unpublishQuestionSets(
      userId,
      ids,
      isAdmin
    );

    res.status(200).json({
      success: true,
      data: results,
      message: `Unpublished ${results.unpublished} question set(s)`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route PATCH /api/v1/batch/question-sets/update
 * @access Private (Expert/Admin)
 */
exports.batchUpdateQuestionSets = async (req, res, next) => {
  try {
    const { ids, updates } = req.body;
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";

    const results = await batchService.updateQuestionSets(
      userId,
      ids,
      updates,
      isAdmin
    );

    res.status(200).json({
      success: true,
      data: results,
      message: `Updated ${results.updated} question set(s)`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/v1/batch/documents/delete
 * @access Private (Learner/Expert/Admin)
 */
exports.batchDeleteDocuments = async (req, res, next) => {
  try {
    const { ids } = req.body;
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";

    const results = await batchService.deleteDocuments(userId, ids, isAdmin);

    res.status(200).json({
      success: true,
      data: results,
      message: `Deleted ${results.deleted} document(s)`,
    });
  } catch (error) {
    next(error);
  }
};
