/**
 * @fileoverview Batch Operations Routes
 * Phase 3.2 - Production Features
 */

const express = require("express");
const router = express.Router();
const batchController = require("../controllers/batch.controller");
const authenticateJWT = require("../middleware/authenticateJWT");
const authorizeRole = require("../middleware/authorizeRole");

// All batch routes require authentication
router.use(authenticateJWT);

// Question Sets batch operations (Expert/Admin only)
router.post(
  "/question-sets/delete",
  authorizeRole("expert", "admin"),
  batchController.batchDeleteQuestionSets
);

router.post(
  "/question-sets/publish",
  authorizeRole("expert", "admin"),
  batchController.batchPublishQuestionSets
);

router.post(
  "/question-sets/unpublish",
  authorizeRole("expert", "admin"),
  batchController.batchUnpublishQuestionSets
);

router.patch(
  "/question-sets/update",
  authorizeRole("expert", "admin"),
  batchController.batchUpdateQuestionSets
);

// Documents batch operations (all authenticated users)
router.post("/documents/delete", batchController.batchDeleteDocuments);

module.exports = router;
