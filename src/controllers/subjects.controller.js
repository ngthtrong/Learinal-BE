const SubjectsService = require('../services/subjects.service');
const service = new SubjectsService();

module.exports = {
  // GET /subjects
  list: async (req, res, next) => {
    try {
      const user = req.user;
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
      const result = await service.listByUser(user.id, { page, pageSize });
      res.status(200).json({ items: result.items, meta: { page, pageSize, total: result.totalItems, totalPages: result.totalPages } });
    } catch (e) { next(e); }
  },

  // POST /subjects
  create: async (req, res, next) => {
    try {
      const user = req.user;
      const created = await service.create(user.id, req.body);
      res.status(201).json(created);
    } catch (e) { next(e); }
  },

  // GET /subjects/:id
  get: async (req, res, next) => {
    try {
      const user = req.user;
      const item = await service.getByIdOwned(user.id, req.params.id);
      if (!item) return res.status(404).json({ code: 'NotFound', message: 'Subject not found' });
      res.status(200).json(item);
    } catch (e) { next(e); }
  },

  // PATCH /subjects/:id
  update: async (req, res, next) => {
    try {
      const user = req.user;
      const updated = await service.updateOwned(user.id, req.params.id, req.body);
      if (!updated) return res.status(404).json({ code: 'NotFound', message: 'Subject not found' });
      res.status(200).json(updated);
    } catch (e) { next(e); }
  },

  // DELETE /subjects/:id
  remove: async (req, res, next) => {
    try {
      const user = req.user;
      const ok = await service.removeOwned(user.id, req.params.id);
      if (!ok) return res.status(404).json({ code: 'NotFound', message: 'Subject not found' });
      res.status(204).send();
    } catch (e) { next(e); }
  },
};
