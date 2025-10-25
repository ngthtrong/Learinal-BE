module.exports = {
  create: async (req, res, next) => { try { throw Object.assign(new Error('NotImplemented'), { status: 501 }); } catch (e) { next(e); } },
  get: async (req, res, next) => { try { throw Object.assign(new Error('NotImplemented'), { status: 501 }); } catch (e) { next(e); } },
};
