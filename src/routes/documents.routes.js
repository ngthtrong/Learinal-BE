const express = require('express');
const multer = require('multer');
const Joi = require('joi');
const authenticateJWT = require('../middleware/authenticateJWT');
const rateLimit = require('../middleware/rateLimit');
const inputValidation = require('../middleware/inputValidation');
const controller = require('../controllers/documents.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const createSchema = Joi.object({
	body: Joi.object({ subjectId: Joi.string().required() }),
}).unknown(true);

router.post('/', rateLimit({ limit: 30 }), authenticateJWT, upload.single('file'), inputValidation(createSchema), controller.create);
router.get('/:id', rateLimit({ limit: 60 }), authenticateJWT, controller.get);
router.get('/:id/summary', rateLimit({ limit: 60 }), authenticateJWT, controller.summary);

module.exports = router;
