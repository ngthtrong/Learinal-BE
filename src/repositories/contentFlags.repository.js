const BaseRepository = require('./base.repository');
const ContentFlag = require('../models/contentFlag.model');

class ContentFlagsRepository extends BaseRepository {
  constructor() {
    super(ContentFlag);
  }
}

module.exports = ContentFlagsRepository;
