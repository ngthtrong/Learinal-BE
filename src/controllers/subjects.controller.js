module.exports = {
  list: async (req, res, next) => { try { throw Object.assign(new Error('NotImplemented'), { status: 501 }); } catch (e) { next(e); } },
  create: async (req, res, next) => { try { throw Object.assign(new Error('NotImplemented'), { status: 501 }); } catch (e) { next(e); } },
};
