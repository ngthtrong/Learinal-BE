const BaseRepository = require('./base.repository');
const { UserSubscription } = require('../models');

class UserSubscriptionsRepository extends BaseRepository {
  constructor() { super(UserSubscription); }
}

module.exports = UserSubscriptionsRepository;
