const BaseRepository = require('./base.repository');
const { QuestionSet } = require('../models');
const mongoose = require('mongoose');

class QuestionSetsRepository extends BaseRepository {
  constructor() { super(QuestionSet); }

  // Override findById to populate creator info
  async findById(id, projection = null) {
    return this.model
      .findById(id, projection)
      .populate('userId', 'fullName email role')
      .lean();
  }

  // Override paginate to include questionCount and optimize by excluding questions array
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
    
    // Convert string IDs to ObjectId for aggregation
    const aggregationFilter = { ...filter };
    if (aggregationFilter.userId && typeof aggregationFilter.userId === 'string') {
      aggregationFilter.userId = new mongoose.Types.ObjectId(aggregationFilter.userId);
    }
    if (aggregationFilter.subjectId && typeof aggregationFilter.subjectId === 'string') {
      aggregationFilter.subjectId = new mongoose.Types.ObjectId(aggregationFilter.subjectId);
    }
    
    // Use aggregation to calculate questionCount without loading all questions
    const pipeline = [
      { $match: aggregationFilter },
      { $sort: sort },
      { $skip: skip },
      { $limit: pageSize },
      {
        $addFields: {
          questionCount: { $size: { $ifNull: ["$questions", []] } }
        }
      },
      {
        $project: {
          // Convert ObjectId to string and include only fields we need
          id: { $toString: "$_id" },
          _id: 0, // Exclude original _id
          userId: { $toString: "$userId" },
          subjectId: { $toString: "$subjectId" },
          title: 1,
          status: 1,
          isShared: 1,
          sharedUrl: 1,
          questionCount: 1,
          createdAt: 1,
          updatedAt: 1
        }
      }
    ];
    
    const [items, totalItems] = await Promise.all([
      this.model.aggregate(pipeline),
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

module.exports = QuestionSetsRepository;
