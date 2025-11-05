const express = require('express');
const Joi = require('joi');
const controller = require('../controllers/validationRequests.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const authorizeRole = require('../middleware/authorizeRole');
const rateLimit = require('../middleware/rateLimit');
const inputValidation = require('../middleware/inputValidation');
const { checkValidationRequestLimit } = require('../middleware/checkEntitlement');

const router = express.Router();

const completeValidationSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().required(),
  }),
  body: Joi.object({
    decision: Joi.string().valid('Approved', 'Rejected').required(),
    feedback: Joi.string().optional(),
    correctedQuestions: Joi.array().optional(),
  }),
}).unknown(true);

router.get('/', rateLimit({ limit: 60 }), authenticateJWT, controller.list);
router.get('/:id', rateLimit({ limit: 60 }), authenticateJWT, controller.get);
router.patch('/:id', rateLimit({ limit: 30 }), authenticateJWT, checkValidationRequestLimit, inputValidation(Joi.object({ params: Joi.object({ id: Joi.string().required() }), body: Joi.object({ status: Joi.string().required(), expertId: Joi.string().optional() }) }).unknown(true)), controller.update);
router.patch('/:id/complete', rateLimit({ limit: 30 }), authenticateJWT, authorizeRole('Expert'), inputValidation(completeValidationSchema), controller.complete);

module.exports = router;
