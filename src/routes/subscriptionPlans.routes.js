const express = require('express');
const router = express.Router();
const controller = require('../controllers/subscriptionPlans.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const authorizeRole = require('../middleware/authorizeRole');

// Public: List active plans
router.get('/', controller.list);

// Admin only: Create, update, archive plans
router.post('/', authenticateJWT, authorizeRole(['Admin']), controller.create);
router.get('/:id', controller.get);
router.patch('/:id', authenticateJWT, authorizeRole(['Admin']), controller.update);
router.delete('/:id', authenticateJWT, authorizeRole(['Admin']), controller.archive);

module.exports = router;
