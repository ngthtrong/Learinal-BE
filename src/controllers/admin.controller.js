const UsersService = require('../services/users.service');
const logger = require('../utils/logger');

const usersService = new UsersService();

module.exports = {
  // GET /admin/users?page=&pageSize=&role=&status=&email=&sort=
  listUsers: async (req, res, next) => {
    try {
      const { page, pageSize, role, status, email, sort } = req.query;

      const result = await usersService.listUsers({
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 20,
        role,
        status,
        email,
        sort: sort || "-createdAt",
      });

      logger.info({
        admin: req.user?.id,
        filters: { role, status, email },
        page: result.meta.page,
        totalItems: result.meta.totalItems,
      }, "Admin listed users");

      return res.status(200).json(result);

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

  // GET /admin/users/:id
  getUser: async (req, res, next) => {
    try {
      const { id } = req.params;
      const user = await usersService.getUserById(id);

      return res.status(200).json(user);

    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({
          code: error.code || "Error",
          message: error.message,
        });
      }
      next(error);
    }
  },

  // PATCH /admin/users/:id
  updateUser: async (req, res, next) => {
    try {
      const { id } = req.params;
      const user = await usersService.updateUserById(id, req.body);

      logger.info({
        admin: req.user?.id,
        targetUser: id,
        updates: Object.keys(req.body),
      }, "Admin updated user");

      return res.status(200).json(user);

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

  // DELETE /admin/users/:id
  deleteUser: async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await usersService.deleteUserById(id);

      logger.info({
        admin: req.user?.id,
        deletedUser: id,
      }, "Admin deactivated user");

      return res.status(200).json(result);

    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({
          code: error.code || "Error",
          message: error.message,
        });
      }
      next(error);
    }
  },
};
