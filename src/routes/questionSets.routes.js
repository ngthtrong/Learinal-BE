const express = require('express');
const Joi = require('joi');
const controller = require('../controllers/questionSets.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const rateLimit = require('../middleware/rateLimit');
const inputValidation = require('../middleware/inputValidation');
const idempotencyKey = require('../middleware/idempotencyKey');

const router = express.Router();

const genSchema = Joi.object({
	body: Joi.object({
		subjectId: Joi.string().required(),
		title: Joi.string().min(1).required(),
		numQuestions: Joi.number().integer().min(1).max(100).default(10),
		difficulty: Joi.string().valid('Biết', 'Hiểu', 'Vận dụng', 'Vận dụng cao').default('Hiểu'),
	}),
}).unknown(true);

router.get('/', rateLimit({ limit: 60 }), authenticateJWT, controller.list);
router.post('/generate', rateLimit({ limit: 30 }), authenticateJWT, idempotencyKey, inputValidation(genSchema), controller.generate);
router.get('/:id', rateLimit({ limit: 60 }), authenticateJWT, controller.get);
router.patch('/:id', rateLimit({ limit: 60 }), authenticateJWT, controller.update);
router.post('/:id/share', rateLimit({ limit: 30 }), authenticateJWT, controller.share);
router.post('/:id/review', rateLimit({ limit: 30 }), authenticateJWT, controller.requestReview);

module.exports = router;
