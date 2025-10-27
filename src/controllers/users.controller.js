const UsersRepository = require("../repositories/users.repository");
const usersRepo = new UsersRepository();

// Simple in-memory ETag store for stub mode
const etags = new Map(); // userId -> etag string

function buildETagFromNow() {
  return `W/"t${Date.now()}"`;
}

module.exports = {
  // GET /users/me
  me: async (req, res, next) => {
    try {
      const user = req.user;
      if (!user)
        return res.status(401).json({ code: "Unauthorized", message: "Authentication required" });

      // Try to fetch the real user from DB (so response matches persisted data)
      let dbUser = null;
      try {
        dbUser = await usersRepo.findByUserId(user.id);
      } catch {}

      // Provide a synthetic ETag (tied to last seen value in memory)
      let etag = etags.get(user.id);
      if (!etag) {
        etag = buildETagFromNow();
        etags.set(user.id, etag);
      }
      res.setHeader("ETag", etag);

      if (dbUser) {
        return res.status(200).json(dbUser);
      }

      // Fallback to request user (stub) if not found in DB
      return res.status(200).json({
        id: user.id,
        fullName: user.fullName || "Stub User",
        email: user.email,
        role: user.role,
        status: user.status || "Active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      next(e);
    }
  },

  // PATCH /users/me (requires If-None-Match)
  updateMe: async (req, res, next) => {
    try {
      const user = req.user;
      if (!user)
        return res.status(401).json({ code: "Unauthorized", message: "Authentication required" });

      const ifNoneMatch = req.headers["if-none-match"];
      if (!ifNoneMatch) {
        return res.status(400).json({
          code: "ValidationError",
          message: "Missing If-None-Match header",
        });
      }

      const currentEtag = etags.get(user.id) || 'W/"t0"';
      // In stub mode, we accept any If-None-Match that equals the current stored value
      if (ifNoneMatch !== currentEtag) {
        return res.status(412).json({ code: "PreconditionFailed", message: "ETag mismatch" });
      }

      // Apply allowed updates (only fullName for now)
      const { fullName } = req.body || {};

      let nextUser;
      try {
        // Persist to DB when possible
        const updated = await usersRepo.updateUserById(user.id, { fullName });
        if (updated) {
          nextUser = updated;
        }
      } catch {}

      if (!nextUser) {
        nextUser = {
          id: user.id,
          fullName: fullName || user.fullName || "Stub User",
          email: user.email,
          role: user.role,
          status: user.status || "Active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      const newEtag = buildETagFromNow();
      etags.set(user.id, newEtag);
      res.setHeader("ETag", newEtag);
      return res.status(200).json(nextUser);
    } catch (e) {
      next(e);
    }
  },
};
