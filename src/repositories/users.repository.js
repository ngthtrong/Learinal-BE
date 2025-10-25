const BaseRepository = require('./base.repository');
const { User } = require('../models');

class UsersRepository extends BaseRepository {
  constructor() { super(User); }
}

module.exports = UsersRepository;
