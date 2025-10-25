const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const requestId = require('./middleware/requestId');
const errorHandler = require('./middleware/errorHandler');
require('dotenv').config();

const app = express();

// Core middleware
app.use(requestId);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Base URL: /api/v1
app.use('/api/v1', routes);

// 404 handler (after all routes)
app.use((req, res) => {
  res.status(404).json({ code: 'NotFound', message: 'Resource not found' });
});

// Error handler (last)
app.use(errorHandler);

module.exports = app;
