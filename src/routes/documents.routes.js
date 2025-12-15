const express = require("express");
const multer = require("multer");
const Joi = require("joi");
const path = require("path");
const fs = require("fs");
const logger = require("../utils/logger");
const authenticateJWT = require("../middleware/authenticateJWT");
const { uploadLimiter } = require("../config/rateLimits");
const inputValidation = require("../middleware/inputValidation");
const controller = require("../controllers/documents.controller");
const { cacheResponse } = require("../middleware/cacheResponse");

const router = express.Router();

// ============================================================================
// UPLOAD DIRECTORY SETUP
// IMPORTANT: Use project directory, NOT OS temp folder (gets auto-cleaned!)
// ============================================================================
const uploadDir = path.resolve(__dirname, "../../uploads/pending");
fs.mkdirSync(uploadDir, { recursive: true });
logger.info({ uploadDir }, "[documents.routes] Upload directory ready");

// ============================================================================
// MULTER CONFIGURATION - Memory storage for reliability
// Files are kept in memory buffer until processed, avoiding filesystem race conditions
// ============================================================================
const upload = multer({
  storage: multer.memoryStorage(), // Store in memory - more reliable for multiple files
  limits: { 
    fileSize: 20 * 1024 * 1024, // 20MB per file
    files: 10 // Max 10 files per request
  },
  fileFilter: (req, file, cb) => {
    // Fix UTF-8 filename encoding
    try {
      file.originalname = Buffer.from(file.originalname, "latin1").toString("utf8");
    } catch (e) {
      // Keep original if conversion fails
    }
    
    // Validate extension
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = [".pdf", ".docx", ".txt"];
    if (!allowedExt.includes(ext)) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', `Unsupported: ${ext}`), false);
    }
    
    cb(null, true);
  },
});

const { checkDocumentUploadLimit } = require("../middleware/checkEntitlement");

const createSchema = Joi.object({
  body: Joi.object({ subjectId: Joi.string().required() }),
}).unknown(true);

// ============================================================================
// ROUTES
// ============================================================================

// POST /documents - Upload and process multiple files
router.post(
  "/",
  uploadLimiter,
  authenticateJWT,
  upload.array("files", 10),
  inputValidation(createSchema),
  checkDocumentUploadLimit,
  controller.create
);

// GET /documents/:id
router.get("/:id", authenticateJWT, cacheResponse({ ttl: 300 }), controller.get);

// GET /documents/:id/summary
router.get("/:id/summary", authenticateJWT, cacheResponse({ ttl: 300 }), controller.summary);

// DELETE /documents/:id
router.delete("/:id", authenticateJWT, controller.remove);

module.exports = router;
