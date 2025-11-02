const express = require('express');
const router = express.Router();
const controller = require('../controllers/userSubscriptions.controller');
const authenticateJWT = require('../middleware/authenticateJWT');

// User must be authenticated
router.use(authenticateJWT);

// Get current user's active subscription
router.get('/me', controller.me);

// Create new subscription (after payment)
router.post('/', controller.create);

// Cancel subscription
router.delete('/:id', controller.cancel);

module.exports = router;
