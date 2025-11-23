/**
 * @fileoverview Export/Import Routes
 * Phase 3.3 - Production Features
 */

const express = require("express");
const router = express.Router();
const exportController = require("../controllers/export.controller");
const authenticateJWT = require("../middleware/authenticateJWT");
const checkExportLimits = require("../middleware/checkExportLimits");

// All export/import routes require authentication
router.use(authenticateJWT);

// Apply export limits to all export routes
router.use(checkExportLimits);

// ============= EXPORT ROUTES =============

// Single question set export
router.get(
  "/question-sets/:id/json",
  exportController.exportQuestionSetJSON
);

router.get(
  "/question-sets/:id/csv",
  exportController.exportQuestionSetCSV
);

router.get(
  "/question-sets/:id/pdf",
  exportController.exportQuestionSetPDF
);

// Batch export
router.post(
  "/question-sets/batch",
  exportController.batchExportQuestionSets
);

module.exports = router;
