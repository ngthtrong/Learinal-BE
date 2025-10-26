const UsersRepository = require('../repositories/users.repository');
const repo = new UsersRepository();

module.exports = {
  // GET /admin/users?page=&pageSize=
  listUsers: async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
      // If running without DB, return an empty page
      if ((process.env.DB_MODE || require('../config').env.dbMode) === 'memory') {
        return res.status(200).json({
          items: [],
          meta: { page, pageSize, total: 0, totalPages: 1 },
        });
      }

      const { items, totalItems, totalPages } = await repo.paginate({}, { page, pageSize, sort: { createdAt: -1 } });

      const mapped = (items || []).map((u) => ({
        id: String(u._id || u.id),
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      }));

      res.status(200).json({
        items: mapped,
        meta: { page, pageSize, total: totalItems, totalPages },
      });
    } catch (e) { next(e); }
  },
};
