module.exports = {
  exchange: async (req, res, next) => {
    try { throw Object.assign(new Error('NotImplemented'), { status: 501 }); }
    catch (err) { next(err); }
  },
  refresh: async (req, res, next) => {
    try { throw Object.assign(new Error('NotImplemented'), { status: 501 }); }
    catch (err) { next(err); }
  },
};
