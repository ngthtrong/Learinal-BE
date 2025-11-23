const express = require('express');
const Joi = require('joi');
const controller = require('../controllers/quizAttempts.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const rateLimit = require('../middleware/rateLimit');
const inputValidation = require('../middleware/inputValidation');

const router = express.Router();

const createSchema = Joi.object({ body: Joi.object({ setId: Joi.string().required() }) }).unknown(true);
const submitSchema = Joi.object({
	params: Joi.object({ id: Joi.string().required() }),
	body: Joi.object({ answers: Joi.array().items(Joi.object({ questionId: Joi.string().required(), selectedOptionIndex: Joi.number().integer().min(0).required() })).required() }),
}).unknown(true);

router.post('/', rateLimit({ limit: 30 }), authenticateJWT, inputValidation(createSchema), controller.create);
router.get('/:id', rateLimit({ limit: 60 }), authenticateJWT, controller.get);
router.post('/:id/submit', rateLimit({ limit: 30 }), authenticateJWT, inputValidation(submitSchema), controller.submit);

module.exports = router;
