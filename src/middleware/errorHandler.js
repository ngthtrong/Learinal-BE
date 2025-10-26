function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error(`[${new Date().toISOString()}] [reqId=${req.id || '-'}]`, err);

  let status = err.status || 500;
  let code = err.code || (status >= 500 ? 'InternalServerError' : 'BadRequest');
  let message = err.message || 'An unexpected error occurred';
  let details = err.details || undefined;

  // Map common Mongoose/Mongo errors to API error shape per project conventions
  const name = err.name || '';
  if (name === 'ValidationError') {
    status = 400;
    code = 'ValidationError';
    // Collect field-level messages
    details = {};
    if (err.errors) {
      for (const [path, e] of Object.entries(err.errors)) {
        details[path] = e.message || 'Invalid value';
      }
    }
    message = 'Validation failed';
  } else if (name === 'CastError') {
    status = 400;
    code = 'ValidationError';
    details = { [err.path || 'value']: `Invalid ${err.kind || 'value'}` };
    message = 'Validation failed';
  } else if (err.code === 11000 || err.code === 'E11000') {
    status = 409;
    code = 'Conflict';
    details = { index: err.code, keyValue: err.keyValue };
    message = 'Duplicate key';
  }

  res.status(status).json({ code, message, ...(details ? { details } : {}) });
}

module.exports = errorHandler;
