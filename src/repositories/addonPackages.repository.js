/**
 * Addon Packages Repository
 * CRUD operations cho gói add-on
 */
const BaseRepository = require("./base.repository");
const AddonPackage = require("../models/addonPackage.model");

class AddonPackagesRepository extends BaseRepository {
  constructor() {
    super(AddonPackage);
  }

  /**
   * Lấy danh sách gói add-on đang active
   */
  async findActivePackages(options = {}) {
    const { sort = { displayOrder: 1, price: 1 }, limit = 50, skip = 0 } = options;
    return this.findMany(
      { status: "Active" },
      { sort, limit, skip }
    );
  }

  /**
   * Lấy gói add-on theo tên
   */
  async findByName(packageName) {
    return this.findOne({ packageName });
  }

  /**
   * Lấy danh sách gói add-on với phân trang (cho admin)
   */
  async findAllWithPagination({ status, page = 1, pageSize = 20, sort = { createdAt: -1 } }) {
    const filter = {};
    if (status) {
      filter.status = status;
    }
    return this.paginate(filter, { page, pageSize, sort });
  }

  /**
   * Cập nhật trạng thái gói
   */
  async updateStatus(id, status) {
    return this.updateById(id, { status });
  }
}

module.exports = AddonPackagesRepository;
