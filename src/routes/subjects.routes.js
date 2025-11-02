const express = require('express');
const Joi = require('joi');
const controller = require('../controllers/subjects.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const rateLimit = require('../middleware/rateLimit');
const inputValidation = require('../middleware/inputValidation');
const { cacheResponse, CacheTTL } = require('../middleware/cacheResponse');

const router = express.Router();

const postSchema = Joi.object({
	body: Joi.object({
		subjectName: Joi.string().min(1).required(),
		description: Joi.string().allow('', null),
		tableOfContents: Joi.array().items(Joi.object()).optional(),
		summary: Joi.string().allow('', null),
	}),
}).unknown(true);

const patchSchema = Joi.object({
	params: Joi.object({ id: Joi.string().required() }),
	body: Joi.object({
		subjectName: Joi.string().min(1).optional(),
		description: Joi.string().allow('', null),
		tableOfContents: Joi.array().items(Joi.object()).optional(),
		summary: Joi.string().allow('', null),
	}),
}).unknown(true);

// GET /subjects
router.get('/', rateLimit({ limit: 60 }), authenticateJWT, cacheResponse({ ttl: CacheTTL.SUBJECT }), controller.list);

// POST /subjects
router.post('/', rateLimit({ limit: 60 }), authenticateJWT, inputValidation(postSchema), controller.create);

// GET /subjects/:id
router.get('/:id', rateLimit({ limit: 60 }), authenticateJWT, cacheResponse({ ttl: CacheTTL.SUBJECT }), controller.get);

// PATCH /subjects/:id
router.patch('/:id', rateLimit({ limit: 60 }), authenticateJWT, inputValidation(patchSchema), controller.update);

// DELETE /subjects/:id
router.delete('/:id', rateLimit({ limit: 60 }), authenticateJWT, controller.remove);

module.exports = router;
