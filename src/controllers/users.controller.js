const UsersService = require("../services/users.service");
const logger = require("../utils/logger");

const usersService = new UsersService();

module.exports = {
  // GET /users/me
  me: async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ 
          code: "Unauthorized", 
          message: "Authentication required" 
        });
      }

      const result = await usersService.getMe(user.id);
      
      if (result.etag) {
        res.setHeader("ETag", result.etag);
      }

      return res.status(200).json(result.user);
      
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({
          code: error.code || "Error",
          message: error.message,
          details: error.details,
        });
      }
      next(error);
    }
  },

  // PATCH /users/me (requires If-None-Match)
  updateMe: async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ 
          code: "Unauthorized", 
          message: "Authentication required" 
        });
      }

      const ifNoneMatch = req.headers["if-none-match"];
      
      if (!ifNoneMatch) {
        return res.status(400).json({
          code: "ValidationError",
          message: "Missing If-None-Match header (ETag required for updates)",
        });
      }

      const result = await usersService.updateMe(user.id, req.body, ifNoneMatch);

      if (result.etag) {
        res.setHeader("ETag", result.etag);
      }

      logger.info({ userId: user.id }, "User profile updated");
      
      return res.status(200).json(result.user);

    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({
          code: error.code || "Error",
          message: error.message,
          details: error.details,
        });
      }
      next(error);
    }
  },
};
