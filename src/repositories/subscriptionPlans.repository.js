const BaseRepository = require('./base.repository');
const { SubscriptionPlan } = require('../models');

class SubscriptionPlansRepository extends BaseRepository {
  constructor() { super(SubscriptionPlan); }
}

module.exports = SubscriptionPlansRepository;
