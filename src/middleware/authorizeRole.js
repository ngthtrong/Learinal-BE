// Role-based authorization middleware factory
function authorizeRole(...roles) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ code: 'Unauthorized', message: 'Authentication required' });
    }
    if (roles.length === 0 || roles.includes(user.role)) {
      return next();
    }
    return res.status(403).json({ code: 'Forbidden', message: 'Insufficient role' });
  };
}

module.exports = authorizeRole;
