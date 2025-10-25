function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error(`[${new Date().toISOString()}] [reqId=${req.id || '-'}]`, err);

  const status = err.status || 500;
  const code = err.code || (status >= 500 ? 'InternalServerError' : 'BadRequest');
  const message = err.message || 'An unexpected error occurred';
  const details = err.details || undefined;

  res.status(status).json({ code, message, ...(details ? { details } : {}) });
}

module.exports = errorHandler;
