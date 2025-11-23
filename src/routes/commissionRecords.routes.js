const express = require('express');
const router = express.Router();
const controller = require('../controllers/commissionRecords.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const authorizeRole = require('../middleware/authorizeRole');
const rateLimit = require('../middleware/rateLimit');

// All endpoints require authentication
router.use(authenticateJWT);

// Expert endpoints
router.get('/', rateLimit({ limit: 60 }), controller.list);
router.get('/summary', rateLimit({ limit: 60 }), authorizeRole('Expert'), controller.summary);
router.get('/:id', rateLimit({ limit: 60 }), controller.get);

// Admin endpoints
router.patch('/:id/mark-paid', rateLimit({ limit: 30 }), authorizeRole('Admin'), controller.markAsPaid);

module.exports = router;
