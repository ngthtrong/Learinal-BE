const express = require('express');
const multer = require('multer');
const Joi = require('joi');
const os = require('os');
const path = require('path');
const fs = require('fs');
const authenticateJWT = require('../middleware/authenticateJWT');
const rateLimit = require('../middleware/rateLimit');
const { uploadLimiter } = require('../config/rateLimits');
const inputValidation = require('../middleware/inputValidation');
const controller = require('../controllers/documents.controller');
const { cacheResponse } = require('../middleware/cacheResponse');

const router = express.Router();

// Create temp directory for uploads
const tempDir = path.join(os.tmpdir(), 'learinal-uploads');
try {
  fs.mkdirSync(tempDir, { recursive: true });
} catch (err) {
  console.error('Failed to create temp upload directory:', err);
}

// Use disk storage for temp files during extraction
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    // Unique temp filename with timestamp and random string
    const uniqueSuffix = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage, 
  limits: { fileSize: 20 * 1024 * 1024 } 
});

const createSchema = Joi.object({
	body: Joi.object({ subjectId: Joi.string().required() }),
}).unknown(true);

router.post('/', uploadLimiter, authenticateJWT, upload.single('file'), inputValidation(createSchema), controller.create);
// Cache document metadata (5 minutes TTL)
router.get('/:id', authenticateJWT, cacheResponse({ ttl: 300 }), controller.get);
router.get('/:id/summary', authenticateJWT, cacheResponse({ ttl: 300 }), controller.summary);

module.exports = router;
