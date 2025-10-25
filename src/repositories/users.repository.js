class UsersRepository {
  constructor(db) {
    this.db = db;
    this.collection = db ? db.collection('users') : null;
  }
  async findById(/* id */) { throw new Error('NotImplemented'); }
  async create(/* dto */) { throw new Error('NotImplemented'); }
  async update(/* id, dto */) { throw new Error('NotImplemented'); }
}

module.exports = UsersRepository;
