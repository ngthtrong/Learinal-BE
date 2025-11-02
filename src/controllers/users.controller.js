const UsersRepository = require("../repositories/users.repository");
const usersRepo = new UsersRepository();

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

      const result = await usersRepo.findByUserIdWithVersion(user.id);
      const dbUser = result?.dto ?? null;
      const dbVersion = result?.version ?? null;
      if (!dbUser || dbVersion === null) {
        return res.status(404).json({ code: "NotFound", message: "User not found" });
      }
      res.setHeader("ETag", buildETagFromVersion(dbVersion));
      return res.status(200).json(dbUser);
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

      // Fetch current version from DB
      const r = await usersRepo.findByUserIdWithVersion(user.id);
      if (!r || r.version === null || !r.dto) {
        return res.status(404).json({ code: "NotFound", message: "User not found" });
      }
      const expectedVersion = r.version;
      const expectedEtag = buildETagFromVersion(expectedVersion);
      if (ifNoneMatch !== expectedEtag) {
        return res.status(412).json({ code: "PreconditionFailed", message: "ETag mismatch" });
      }

      // Apply allowed updates (only fullName for now)
      const { fullName } = req.body || {};

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
      const newV = updated.version;
      if (typeof newV === "number") {
        res.setHeader("ETag", buildETagFromVersion(newV));
      }
      return res.status(200).json(updated.dto);
    } catch (e) {
      next(e);
    }
  },
};
