class SubjectsRepository {
  constructor(db) {
    this.db = db;
    this.collection = db ? db.collection('subjects') : null;
  }
  async findById(/* id */) { throw new Error('NotImplemented'); }
}

module.exports = SubjectsRepository;
