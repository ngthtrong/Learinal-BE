const ValidationRequestsRepository = require('../repositories/validationRequests.repository');

const repo = new ValidationRequestsRepository();
function mapId(doc) { if (!doc) return doc; const { _id, __v, ...rest } = doc; return { id: String(_id || rest.id), ...rest }; }

module.exports = {
  // GET /validation-requests
  list: async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
      const { items, totalItems, totalPages } = await repo.paginate({}, { page, pageSize, sort: { createdAt: -1 } });
      res.status(200).json({ items: (items || []).map(mapId), meta: { page, pageSize, total: totalItems, totalPages } });
    } catch (e) { next(e); }
  },
  // GET /validation-requests/:id
  get: async (req, res, next) => {
    try {
      const item = await repo.findById(req.params.id);
      if (!item) return res.status(404).json({ code: 'NotFound', message: 'Not found' });
      res.status(200).json(mapId(item));
    } catch (e) { next(e); }
  },
  // PATCH /validation-requests/:id
  update: async (req, res, next) => {
    try {
      const allowed = {}; if (req.body.status) allowed.status = req.body.status; if (req.body.expertId) allowed.expertId = req.body.expertId;
      const updated = await repo.updateById(req.params.id, { $set: allowed }, { new: true });
      if (!updated) return res.status(404).json({ code: 'NotFound', message: 'Not found' });
      res.status(200).json(mapId(updated));
    } catch (e) { next(e); }
  },
};
