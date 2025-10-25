// Placeholder JWT authentication middleware
function authenticateJWT(req, res, next) {
  // TODO: Verify Bearer token, attach req.user
  return res.status(401).json({ code: 'Unauthorized', message: 'Authentication required' });
}

module.exports = authenticateJWT;
