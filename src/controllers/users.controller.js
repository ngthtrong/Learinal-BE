const UsersRepository = require("../repositories/users.repository");
const usersRepo = new UsersRepository();

// Simple in-memory ETag version store for stub mode
const etagVersions = new Map(); // userId -> numeric version

function buildETagFromVersion(v) {
  return `W/"v${v}"`;
}

module.exports = {
  // GET /users/me
  me: async (req, res, next) => {
    try {
      const user = req.user;
      if (!user)
        return res.status(401).json({ code: "Unauthorized", message: "Authentication required" });

      // Try to fetch both the normalized DTO and the raw __v in one call
      let dbUser = null;
      let dbVersion = null;
      try {
        const result = await usersRepo.findByUserIdWithVersion(user.id);
        dbUser = result?.dto ?? null;
        dbVersion = result?.version ?? null;
      } catch {
        // ignore - we'll fall back to in-memory stub version
      }

      if (dbVersion !== null) {
        res.setHeader("ETag", buildETagFromVersion(dbVersion));
      } else {
        let version = etagVersions.get(user.id);
        if (!version) {
          version = 1;
          etagVersions.set(user.id, version);
        }
        res.setHeader("ETag", buildETagFromVersion(version));
      }

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

      const currentVersion = etagVersions.get(user.id) || 0;
      // DB-aware ETag handling: fetch DTO+version once and check expected ETag.
      let usingDb = false;
      let expectedVersion;
      try {
        const r = await usersRepo.findByUserIdWithVersion(user.id);
        if (r && r.version !== null) {
          usingDb = true;
          expectedVersion = r.version;
          const expectedEtag = buildETagFromVersion(expectedVersion);
          if (ifNoneMatch !== expectedEtag) {
            return res.status(412).json({ code: "PreconditionFailed", message: "ETag mismatch" });
          }
        }
      } catch {
        // ignore and fall back to in-memory
      }

      if (!usingDb) {
        const currentEtag = buildETagFromVersion(currentVersion);
        if (ifNoneMatch !== currentEtag) {
          return res.status(412).json({ code: "PreconditionFailed", message: "ETag mismatch" });
        }
      }

      // Apply allowed updates (only fullName for now)
      const { fullName } = req.body || {};

      let nextUser;
      // If we detected a DB user above, attempt a versioned update using the
      // optimistic-concurrency helper. If the update fails due to version
      // mismatch, return 412.
      if (usingDb) {
        try {
          const updated = await usersRepo.updateByIdWithVersion(
            user.id,
            { $set: { fullName } },
            expectedVersion
          );
          if (!updated || !updated.dto) {
            return res
              .status(412)
              .json({
                code: "PreconditionFailed",
                message: "ETag mismatch or concurrent modification",
              });
          }
          // Use the returned normalized DTO and version from the update call
          nextUser = updated.dto;
          const newV = updated.version;
          if (typeof newV === "number") {
            res.setHeader("ETag", buildETagFromVersion(newV));
          }
          return res.status(200).json(nextUser);
        } catch {
          // fall back to stub behavior below
        }
      }

      // Fallback (stub) update when no DB or DB update failed: update in-memory
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

      const prev = etagVersions.get(user.id) || 0;
      const newVersion = prev + 1;
      etagVersions.set(user.id, newVersion);
      const newEtag = buildETagFromVersion(newVersion);
      res.setHeader("ETag", newEtag);
      return res.status(200).json(nextUser);
    } catch (e) {
      next(e);
    }
  },
};
