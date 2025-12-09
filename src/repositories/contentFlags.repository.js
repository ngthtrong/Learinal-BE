const BaseRepository = require('./base.repository');
const ContentFlag = require('../models/contentFlag.model');

class ContentFlagsRepository extends BaseRepository {
  constructor() {
    super(ContentFlag);
  }

  // Override findById to populate user fields
  async findById(id, projection = null) {
    return this.model
      .findById(id, projection)
      .populate('reportedBy', 'fullName email')
      .populate('assignedExpert', 'fullName email')
      .lean();
  }

  // Override paginate to populate user fields
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
      this.model
        .find(filter, projection)
        .populate('reportedBy', 'fullName email')
        .populate('assignedExpert', 'fullName email')
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      this.count(filter),
    ]);
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    return {
      items,
      totalItems,
      totalPages,
      meta: { page, pageSize, totalItems, totalPages },
    };
  }
}

module.exports = ContentFlagsRepository;
