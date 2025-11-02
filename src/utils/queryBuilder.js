/**
 * Build complex MongoDB queries from request params
 * Supports filtering, sorting, field selection, and pagination
 */
class QueryBuilder {
  constructor(model, queryParams) {
    this.model = model;
    this.queryParams = queryParams;
    this.query = model.find();
  }

  /**
   * Apply filters from query params
   * Removes pagination/meta params and builds MongoDB query
   */
  filter() {
    const queryObj = { ...this.queryParams };
    
    // Remove pagination and meta fields
    const excludeFields = ['page', 'pageSize', 'sort', 'fields', 'limit', 'skip'];
    excludeFields.forEach((field) => delete queryObj[field]);

    // Advanced filtering with operators (gte, gt, lte, lt)
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt|in|nin|ne)\b/g, (match) => `$${match}`);

    this.query = this.query.find(JSON.parse(queryStr));
    return this;
  }

  /**
   * Apply sorting
   * Supports multiple fields: ?sort=field1,-field2
   * Minus sign (-) for descending order
   */
  sort() {
    if (this.queryParams.sort) {
      const sortBy = this.queryParams.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      // Default sort by createdAt descending
      this.query = this.query.sort('-createdAt');
    }
    return this;
  }

  /**
   * Limit fields returned
   * ?fields=field1,field2,field3
   */
  limitFields() {
    if (this.queryParams.fields) {
      const fields = this.queryParams.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    } else {
      // Exclude __v by default
      this.query = this.query.select('-__v');
    }
    return this;
  }

  /**
   * Pagination
   * ?page=1&pageSize=20
   */
  paginate() {
    const page = parseInt(this.queryParams.page) || 1;
    const pageSize = Math.min(parseInt(this.queryParams.pageSize) || 20, 100); // Max 100 items
    const skip = (page - 1) * pageSize;

    this.query = this.query.skip(skip).limit(pageSize);
    return this;
  }

  /**
   * Execute query and return results
   */
  async execute() {
    return await this.query;
  }

  /**
   * Execute with count for pagination metadata
   */
  async executeWithCount() {
    const countQuery = this.model.find(this.query.getFilter());
    const [results, total] = await Promise.all([
      this.query,
      countQuery.countDocuments(),
    ]);

    const page = parseInt(this.queryParams.page) || 1;
    const pageSize = Math.min(parseInt(this.queryParams.pageSize) || 20, 100);

    return {
      results,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}

module.exports = QueryBuilder;
