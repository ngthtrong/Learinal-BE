/**
 * @fileoverview Import Routes
 * Phase 3.3 - Production Features
 */

const express = require("express");
const router = express.Router();
const exportController = require("../controllers/export.controller");
const authenticateJWT = require("../middleware/authenticateJWT");

// All import routes require authentication
router.use(authenticateJWT);

// ============= IMPORT ROUTES =============

// Single question set import
router.post(
  "/question-sets/json",
  exportController.importQuestionSetJSON
);

router.post(
  "/question-sets/csv",
  exportController.importQuestionSetCSV
);

// Batch import
router.post(
  "/question-sets/batch",
  exportController.batchImportQuestionSets
);

module.exports = router;
