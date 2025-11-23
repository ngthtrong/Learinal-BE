class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  async findById(id, projection = null) {
    return this.model.findById(id, projection).lean();
  }

  async findOne(filter = {}, projection = null, options = {}) {
    const { lean = true, ...otherOptions } = options;
    const query = this.model.findOne(filter, projection, otherOptions);
    return lean ? query.lean() : query;
  }

  async findMany(
    filter = {},
    { projection = null, sort = { createdAt: -1 }, limit = 20, skip = 0 } = {}
  ) {
    return this.model
      .find(filter, projection)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async create(doc) {
    const created = await this.model.create(doc);
    return created.toObject();
  }

  async updateById(id, update, options = { new: true }) {
    return this.model
      .findByIdAndUpdate(id, update, { new: true, ...options })
      .lean();
  }

  async updateMany(filter, update, options = {}) {
    return this.model.updateMany(filter, update, options);
  }

  async deleteById(id) {
    return this.model.findByIdAndDelete(id).lean();
  }

  async deleteMany(filter = {}) {
    return this.model.deleteMany(filter);
  }

  async count(filter = {}) {
    return this.model.countDocuments(filter);
  }

  async countDocuments(filter = {}) {
    return this.count(filter);
  }

  async paginate(
    filter = {},
    {
      page = 1,
      pageSize = 20,
      sort = { createdAt: -1 },
      projection = null,
    } = {}
  ) {
    const skip = (page - 1) * pageSize;
    const [items, totalItems] = await Promise.all([
      this.findMany(filter, { projection, sort, limit: pageSize, skip }),
      this.count(filter),
    ]);
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    return {
      items,
      meta: { page, pageSize, totalItems, totalPages },
    };
  }
}

module.exports = BaseRepository;
