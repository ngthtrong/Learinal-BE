const express = require('express');
const router = express.Router();
const controller = require('../controllers/commissionRecords.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const authorizeRole = require('../middleware/authorizeRole');
const rateLimit = require('../middleware/rateLimit');

// All endpoints require authentication
router.use(authenticateJWT);

// Expert endpoints (Summary must come before /:id to avoid conflict)
router.get('/summary', rateLimit({ limit: 60 }), authorizeRole('Expert', 'Admin'), controller.summary);
router.get('/stats', rateLimit({ limit: 60 }), authorizeRole('Expert', 'Admin'), controller.stats);

// Admin endpoints (Must come before /:id to avoid conflict)
router.get('/config', rateLimit({ limit: 60 }), authorizeRole('Admin'), controller.getConfig);
router.get('/pending-summary', rateLimit({ limit: 60 }), authorizeRole('Admin'), controller.pendingSummary);
router.post('/reconcile', rateLimit({ limit: 5 }), authorizeRole('Admin'), controller.reconcile);
router.patch('/batch/mark-paid', rateLimit({ limit: 10 }), authorizeRole('Admin'), controller.batchMarkAsPaid);

// General endpoints
router.get('/', rateLimit({ limit: 60 }), controller.list);
router.get('/:id', rateLimit({ limit: 60 }), controller.get);
router.patch('/:id/mark-paid', rateLimit({ limit: 30 }), authorizeRole('Admin'), controller.markAsPaid);

module.exports = router;
