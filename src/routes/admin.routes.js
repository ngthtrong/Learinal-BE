const express = require('express');
const controller = require('../controllers/admin.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const authorizeRole = require('../middleware/authorizeRole');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

// GET /admin/users (Admin only)
router.get('/users', rateLimit({ limit: 60 }), authenticateJWT, authorizeRole('Admin'), controller.listUsers);

module.exports = router;
