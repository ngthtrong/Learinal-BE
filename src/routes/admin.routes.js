const express = require('express');
const controller = require('../controllers/admin.controller');
const authenticateJWT = require('../middleware/authenticateJWT');
const authorizeRole = require('../middleware/authorizeRole');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

// All admin routes require authentication and Admin role
router.use(authenticateJWT);
router.use(authorizeRole('Admin'));

// User Management
router.get('/users', rateLimit({ limit: 60 }), controller.listUsers);
router.get('/users/:id', controller.getUser);
router.patch('/users/:id', controller.updateUser);
router.post('/users/:id/ban', controller.banUser);
router.post('/users/:id/activate', controller.activateUser);
router.patch('/users/:id/role', controller.changeRole);

// System Statistics
router.get('/stats', controller.getStats);

// Revenue & Analytics
router.get('/revenue', controller.getRevenue);
router.get('/experts/performance', controller.getExpertPerformance);

module.exports = router;
