const BaseRepository = require("./base.repository");
const { User } = require("../models");

const normalizeUser = (doc, { includeSensitive = false } = {}) => {
  if (!doc) {
    return null;
  }

  const plain = { ...doc };
  const id = plain._id?.toString?.() || plain.id || plain.userId;
  if (id) {
    plain.id = id;
    plain.userId = id;
  }

  if (plain.subscriptionPlanId && plain.subscriptionPlanId.toString) {
    plain.subscriptionPlanId = plain.subscriptionPlanId.toString();
  }
  if (plain.subscriptionPlanId === undefined) {
    plain.subscriptionPlanId = null;
  }

  if (plain.subscriptionRenewalDate instanceof Date) {
    plain.subscriptionRenewalDate = plain.subscriptionRenewalDate.toISOString();
  }
  if (plain.createdAt instanceof Date) {
    plain.createdAt = plain.createdAt.toISOString();
  }
  if (plain.updatedAt instanceof Date) {
    plain.updatedAt = plain.updatedAt.toISOString();
  }

  if (!includeSensitive) {
    delete plain.hashedPassword;
  }

  delete plain._id;
  delete plain.__v;

  return plain;
};

class UsersRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  async findByUserId(userId, options = {}) {
    const { projection = null, includeSensitive = false } = options;
    const doc = await this.model.findById(userId, projection).lean();
    return normalizeUser(doc, { includeSensitive });
  }

  async findByEmail(email, options = {}) {
    if (!email || typeof email !== "string") {
      return null;
    }

    const { projection = null, includeSensitive = false } = options;
    const normalizedEmail = email.toLowerCase().trim();
    const doc = await this.model
      .findOne({ email: normalizedEmail }, projection)
      .lean();
    return normalizeUser(doc, { includeSensitive });
  }

  async isEmailTaken(email, excludeUserId) {
    if (!email || typeof email !== "string") {
      return false;
    }

    const filter = { email: email.toLowerCase().trim() };
    if (excludeUserId) {
      filter._id = { $ne: excludeUserId };
    }

    const exists = await this.model.exists(filter);
    return Boolean(exists);
  }

  async createUser(payload, options = {}) {
    const { includeSensitive = false } = options;
    const createdDoc = await this.model.create(payload);
    const created = await this.model.findById(createdDoc._id).lean();
    return normalizeUser(created, { includeSensitive });
  }

  async updateUserById(userId, update, options = {}) {
    const {
      includeSensitive = false,
      projection = null,
      new: returnNew = true,
    } = options;
    const hasOperator = Object.keys(update || {}).some((key) =>
      key.startsWith("$")
    );
    const updatePayload = hasOperator ? update : { $set: update };
    const doc = await this.model
      .findOneAndUpdate({ _id: userId }, updatePayload, {
        new: returnNew,
        runValidators: true,
        projection,
      })
      .lean();

    return normalizeUser(doc, { includeSensitive });
  }

  async listByRoleAndStatus(role, status, options = {}) {
    const {
      projection = null,
      sort = { createdAt: -1 },
      limit = 20,
      skip = 0,
      includeSensitive = false,
    } = options;

    const filter = {};
    if (role) {
      filter.role = role;
    }
    if (status) {
      filter.status = status;
    }

    const docs = await this.model
      .find(filter, projection)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    return docs.map((doc) => normalizeUser(doc, { includeSensitive }));
  }

  async paginateUsers(filter = {}, options = {}) {
    const {
      page = 1,
      pageSize = 20,
      sort = { createdAt: -1 },
      projection = null,
      includeSensitive = false,
    } = options;

    const skip = (page - 1) * pageSize;
    const [items, totalItems] = await Promise.all([
      this.model
        .find(filter, projection)
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      this.model.countDocuments(filter),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    return {
      items: items.map((doc) => normalizeUser(doc, { includeSensitive })),
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
    };
  }
}

module.exports = UsersRepository;
