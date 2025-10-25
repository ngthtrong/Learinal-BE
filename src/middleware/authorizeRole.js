// Placeholder role-based authorization middleware factory
function authorizeRole(...roles) {
  return (req, res, next) => {
    // TODO: Check req.user.role against roles
    return res.status(403).json({ code: 'Forbidden', message: 'Insufficient role' });
  };
}

module.exports = authorizeRole;
