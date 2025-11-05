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

const documentsQuerySchema = Joi.object({
	params: Joi.object({ subjectId: Joi.string().required() }),
	query: Joi.object({
		page: Joi.number().integer().min(1).optional(),
		pageSize: Joi.number().integer().min(1).max(100).optional(),
		status: Joi.string().valid('Uploading', 'Processing', 'Completed', 'Error').optional(),
	}),
}).unknown(true);

const questionSetsQuerySchema = Joi.object({
	params: Joi.object({ subjectId: Joi.string().required() }),
	query: Joi.object({
		page: Joi.number().integer().min(1).optional(),
		pageSize: Joi.number().integer().min(1).max(100).optional(),
		status: Joi.string().valid('Pending', 'Processing', 'Draft', 'Public', 'PendingValidation', 'InReview', 'Validated', 'Rejected', 'PendingApproval', 'Published', 'Error').optional(),
		isShared: Joi.boolean().optional(),
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

// GET /subjects/:subjectId/documents - Get all documents for a subject
router.get(
	'/:subjectId/documents',
	rateLimit({ limit: 60 }),
	authenticateJWT,
	inputValidation(documentsQuerySchema),
	cacheResponse({ ttl: CacheTTL.DOCUMENT }),
	require('../controllers/documents.controller').listBySubject
);

// GET /subjects/:subjectId/question-sets - Get all question sets for a subject
router.get(
	'/:subjectId/question-sets',
	rateLimit({ limit: 60 }),
	authenticateJWT,
	inputValidation(questionSetsQuerySchema),
	cacheResponse({ ttl: 600 }),
	require('../controllers/questionSets.controller').listBySubject
);

module.exports = router;
