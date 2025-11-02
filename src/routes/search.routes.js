const express = require('express');
const controller = require('../controllers/search.controller');
const authenticateJWT = require('../middleware/authenticateJWT');

const router = express.Router();

// Global search (optional authentication - results filtered by user)
router.get('/', authenticateJWT, controller.globalSearch);

// Advanced question set filtering
router.get('/question-sets', authenticateJWT, controller.filterQuestionSets);

module.exports = router;
