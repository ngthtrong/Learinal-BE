const UsersService = require("../services/users.service");
const { createRepositories } = require("../repositories");

const { usersRepository } = createRepositories();
const usersService = new UsersService({ usersRepository });

module.exports = {
  me: async (req, res, next) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      const isValidObjectId =
        typeof userId === "string" && /^[a-fA-F0-9]{24}$/.test(userId);
      if (!isValidObjectId) {
        const err = new Error("Authentication required");
        err.status = 401;
        err.code = "Unauthorized";
        throw err;
      }

      const { user, etag } = await usersService.getMe(userId);
      if (etag) res.set("ETag", etag);
      res.status(200).json(user);
    } catch (e) {
      next(e);
    }
  },
  updateMe: async (req, res, next) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      const isValidObjectId =
        typeof userId === "string" && /^[a-fA-F0-9]{24}$/.test(userId);
      if (!isValidObjectId) {
        const err = new Error("Authentication required");
        err.status = 401;
        err.code = "Unauthorized";
        throw err;
      }

      const ifNoneMatch =
        req.header("If-None-Match") || req.header("if-none-match");
      const { user, etag } = await usersService.updateMe(
        userId,
        req.body || {},
        ifNoneMatch
      );
      if (etag) res.set("ETag", etag);
      res.status(200).json(user);
    } catch (e) {
      next(e);
    }
  },
};
