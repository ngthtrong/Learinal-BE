const UserSubscriptionsRepository = require('../repositories/userSubscriptions.repository');
const repo = new UserSubscriptionsRepository();

function map(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

module.exports = {
  // GET /user-subscriptions/me
  me: async (req, res, next) => {
    try {
      const user = req.user;
      const items = await repo.findMany({ userId: user.id }, { sort: { createdAt: -1 } });
      return res.status(200).json((items || []).map(map));
    } catch (e) { next(e); }
  },
};
