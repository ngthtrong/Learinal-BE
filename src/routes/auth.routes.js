const express = require('express');
const controller = require('../controllers/auth.controller');
const rateLimit = require('../middleware/rateLimit');
const inputValidation = require('../middleware/inputValidation');
const Joi = require('joi');

const router = express.Router();

// POST /auth/exchange - Exchange OAuth code for JWT (stub/real)
const exchangeSchema = Joi.object({
	body: Joi.object({ code: Joi.string().optional() }),
}).unknown(true);

router.post('/exchange', rateLimit({ limit: 60 }), inputValidation(exchangeSchema), controller.exchange);

// POST /auth/refresh - Refresh access token (stub/real)
const refreshSchema = Joi.object({
	body: Joi.object({ refreshToken: Joi.string().optional() }),
}).unknown(true);

router.post('/refresh', rateLimit({ limit: 60 }), inputValidation(refreshSchema), controller.refresh);

module.exports = router;
