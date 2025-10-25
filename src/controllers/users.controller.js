module.exports = {
  me: async (req, res, next) => { try { throw Object.assign(new Error('NotImplemented'), { status: 501 }); } catch (e) { next(e); } },
  updateMe: async (req, res, next) => { try { throw Object.assign(new Error('NotImplemented'), { status: 501 }); } catch (e) { next(e); } },
};
