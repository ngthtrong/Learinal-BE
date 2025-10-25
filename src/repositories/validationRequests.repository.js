const BaseRepository = require('./base.repository');
const { ValidationRequest } = require('../models');

class ValidationRequestsRepository extends BaseRepository {
  constructor() { super(ValidationRequest); }
}

module.exports = ValidationRequestsRepository;
