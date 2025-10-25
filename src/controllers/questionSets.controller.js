module.exports = {
  list: async (req, res, next) => { try { throw Object.assign(new Error('NotImplemented'), { status: 501 }); } catch (e) { next(e); } },
  generate: async (req, res, next) => { try { throw Object.assign(new Error('NotImplemented'), { status: 501 }); } catch (e) { next(e); } },
};
