const express = require('express');
const Joi = require('joi');
const controller = require('../controllers/validationRequests.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const rateLimit = require('../middleware/rateLimit');
const inputValidation = require('../middleware/inputValidation');

const router = express.Router();

router.get('/', rateLimit({ limit: 60 }), authenticateJWT, controller.list);
router.get('/:id', rateLimit({ limit: 60 }), authenticateJWT, controller.get);
router.patch('/:id', rateLimit({ limit: 30 }), authenticateJWT, inputValidation(Joi.object({ params: Joi.object({ id: Joi.string().required() }), body: Joi.object({ status: Joi.string().required(), expertId: Joi.string().optional() }) }).unknown(true)), controller.update);

module.exports = router;
