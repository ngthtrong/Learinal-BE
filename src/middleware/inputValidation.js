// Joi-based input validation middleware
function inputValidation(schema) {
  return (req, res, next) => {
    if (!schema) return next();
    const data = {
      params: req.params,
      query: req.query,
      body: req.body,
      headers: req.headers,
    };
    const { error, value } = schema.validate(data, { abortEarly: false, allowUnknown: true, stripUnknown: false });
    if (error) {
      const details = {};
      error.details.forEach((d) => {
        const key = d.path.join('.') || 'input';
        details[key] = d.message;
      });
      return res.status(400).json({ code: 'ValidationError', message: 'Invalid input', details });
    }
    // Optionally assign sanitized values back
    if (value && value.body) req.body = value.body;
    if (value && value.params) req.params = value.params;
    if (value && value.query) req.query = value.query;
    return next();
  };
}

module.exports = inputValidation;
