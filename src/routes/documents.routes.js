const express = require('express');
const multer = require('multer');
const Joi = require('joi');
const authenticateJWT = require('../middleware/authenticateJWT');
const rateLimit = require('../middleware/rateLimit');
const inputValidation = require('../middleware/inputValidation');
const controller = require('../controllers/documents.controller');

const router = express.Router();

// Multer config for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// Validation schemas
const createSchema = Joi.object({
  body: Joi.object({ subjectId: Joi.string().required() }),
}).unknown(true);

// Routes
router.post(
  '/',
  rateLimit({ limit: 30 }),
  authenticateJWT,
  upload.single('file'),
  inputValidation(createSchema),
  controller.create
);

router.get('/', rateLimit({ limit: 60 }), authenticateJWT, controller.list);
router.get('/:id', rateLimit({ limit: 60 }), authenticateJWT, controller.get);
router.get('/:id/summary', rateLimit({ limit: 60 }), authenticateJWT, controller.summary);
router.delete('/:id', rateLimit({ limit: 60 }), authenticateJWT, controller.remove);

module.exports = router;
