const SubscriptionPlansRepository = require('../repositories/subscriptionPlans.repository');
const repo = new SubscriptionPlansRepository();

function map(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

module.exports = {
  // GET /subscription-plans (public)
  list: async (req, res, next) => {
    try {
      // Public list of active plans, newest first
      const items = await repo.findMany({ status: 'Active' }, { sort: { updatedAt: -1 } });
      return res.status(200).json((items || []).map(map));
    } catch (e) { next(e); }
  },
};
