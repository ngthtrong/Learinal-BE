const BaseRepository = require('./base.repository');
const { Document } = require('../models');

class DocumentsRepository extends BaseRepository {
  constructor() { super(Document); }
}

module.exports = DocumentsRepository;
