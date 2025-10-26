const NotificationsRepository = require('../repositories/notifications.repository');
const repo = new NotificationsRepository();
function mapId(doc) { if (!doc) return doc; const { _id, __v, ...rest } = doc; return { id: String(_id || rest.id), ...rest }; }

module.exports = {
  // GET /notifications
  list: async (req, res, next) => {
    try {
      const user = req.user;
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
      const { items, totalItems, totalPages } = await repo.paginate({ userId: user.id }, { page, pageSize, sort: { createdAt: -1 } });
      res.status(200).json({ items: (items || []).map(mapId), meta: { page, pageSize, total: totalItems, totalPages } });
    } catch (e) { next(e); }
  },

  // PATCH /notifications/:id (mark as read)
  update: async (req, res, next) => {
    try {
      const user = req.user;
      const updated = await repo.updateById(req.params.id, { $set: { isRead: true } }, { new: true });
      if (!updated || String(updated.userId) !== String(user.id)) return res.status(404).json({ code: 'NotFound', message: 'Not found' });
      res.status(200).json(mapId(updated));
    } catch (e) { next(e); }
  },
};
