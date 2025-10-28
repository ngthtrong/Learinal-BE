const express = require('express');
const controller = require('../controllers/admin.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const authorizeRole = require('../middleware/authorizeRole');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

// Admin-only routes
const adminAuth = [rateLimit({ limit: 60 }), authenticateJWT, authorizeRole('Admin')];

// GET /admin/users - List all users with filters
router.get('/users', ...adminAuth, controller.listUsers);

// GET /admin/users/:id - Get user by ID
router.get('/users/:id', ...adminAuth, controller.getUser);

// PATCH /admin/users/:id - Update user
router.patch('/users/:id', ...adminAuth, controller.updateUser);

// DELETE /admin/users/:id - Deactivate user
router.delete('/users/:id', ...adminAuth, controller.deleteUser);

module.exports = router;
