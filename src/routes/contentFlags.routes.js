const express = require('express');
const controller = require('../controllers/contentFlags.controller');
const authenticateJWT = require('../middleware/authenticateJWT');

const router = express.Router();

// All routes require authentication
router.use(authenticateJWT);

// User creates a report
router.post('/', controller.create);

// List flags (Admin sees all, Expert sees assigned, Learner sees their reports)
router.get('/', controller.list);

// Get flags by content IDs (for expert to see which sets have reports)
router.get('/by-content', controller.getByContent);

// Get single flag details
router.get('/:id', controller.get);

// Admin reviews and decides action
router.patch('/:id/review', controller.adminReview);

// Expert responds after fixing
router.patch('/:id/expert-respond', controller.expertRespond);

// Admin marks as resolved
router.patch('/:id/resolve', controller.resolve);

module.exports = router;
