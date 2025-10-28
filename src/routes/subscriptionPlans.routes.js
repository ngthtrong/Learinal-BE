const express = require('express');
const rateLimit = require('../middleware/rateLimit');
const controller = require('../controllers/subscriptionPlans.controller');

const router = express.Router();

// GET /subscription-plans (public)
router.get('/', rateLimit({ limit: 60 }), controller.list);

module.exports = router;
