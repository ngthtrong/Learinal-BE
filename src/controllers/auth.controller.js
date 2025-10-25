const AuthService = require("../services/auth.service");

const authService = new AuthService();

const buildValidationError = (details) => {
  const err = new Error("Validation failed");
  err.status = 400;
  err.code = "ValidationError";
  err.details = details;
  return err;
};

module.exports = {
  exchange: async (req, res, next) => {
    try {
      const { code, redirectUri } = req.body || {};
      // In stub mode we accept any code; if strictly needed, validate presence
      if (!code) {
        return next(buildValidationError({ code: "required" }));
      }

      const devUser = {
        id:
          req.headers["x-dev-user-id"] ||
          req.headers["X-Dev-User-Id"] ||
          undefined,
        email:
          req.headers["x-dev-user-email"] ||
          req.headers["X-Dev-User-Email"] ||
          undefined,
        role:
          req.headers["x-dev-user-role"] ||
          req.headers["X-Dev-User-Role"] ||
          undefined,
      };

      const { accessToken, refreshToken } = await authService.exchangeCode({
        code,
        redirectUri,
        user: devUser,
      });
      res.status(200).json({ accessToken, refreshToken });
    } catch (err) {
      next(err);
    }
  },
  refresh: async (req, res, next) => {
    try {
      const { refreshToken } = req.body || {};
      if (!refreshToken) {
        return next(buildValidationError({ refreshToken: "required" }));
      }

      const devUser = {
        id:
          req.headers["x-dev-user-id"] ||
          req.headers["X-Dev-User-Id"] ||
          undefined,
        email:
          req.headers["x-dev-user-email"] ||
          req.headers["X-Dev-User-Email"] ||
          undefined,
        role:
          req.headers["x-dev-user-role"] ||
          req.headers["X-Dev-User-Role"] ||
          undefined,
      };

      const tokens = await authService.refreshToken({
        refreshToken,
        user: devUser,
      });
      res.status(200).json(tokens);
    } catch (err) {
      next(err);
    }
  },
};
