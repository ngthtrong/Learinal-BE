const BaseRepository = require('./base.repository');
const { Notification } = require('../models');

class NotificationsRepository extends BaseRepository {
  constructor() { super(Notification); }
}

module.exports = NotificationsRepository;
