const BaseRepository = require("./base.repository");
const { User } = require("../models");

const normalizeUser = (doc, { includeSensitive = false } = {}) => {
  if (!doc) return null;

  const plain = { ...doc };
  const id = plain._id?.toString?.() || plain.id || plain.userId;

  // Normalize primitives/conversions
  const subscriptionPlanId =
    plain.subscriptionPlanId?.toString?.() ??
    (plain.subscriptionPlanId === undefined ? null : plain.subscriptionPlanId);
  const subscriptionRenewalDate =
    plain.subscriptionRenewalDate instanceof Date
      ? plain.subscriptionRenewalDate.toISOString()
      : (plain.subscriptionRenewalDate ?? null);
  const createdAt =
    plain.createdAt instanceof Date ? plain.createdAt.toISOString() : plain.createdAt;
  const updatedAt =
    plain.updatedAt instanceof Date ? plain.updatedAt.toISOString() : plain.updatedAt;

  // Build DTO with desired field order (id first) and without userId
  const dto = {
    id: id,
    email: plain.email,
    fullName: plain.fullName,
    role: plain.role,
    status: plain.status,
    subscriptionPlanId,
    subscriptionStatus: plain.subscriptionStatus,
    subscriptionRenewalDate,
    createdAt,
    updatedAt,
  };

  if (includeSensitive) {
    dto.hashedPassword = plain.hashedPassword;
  }

  return dto;
};

class UsersRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  async updateByIdWithVersion(id, update, expectedVersion, options = {}) {
    const filter = { _id: id };

    // Build update payload: if caller provided operators (e.g. $set), keep them,
    // otherwise wrap into $set so we can safely merge $inc below.
    const hasOperator = Object.keys(update || {}).some((k) => k.startsWith("$"));
    const updatePayload = hasOperator ? { ...update } : { $set: update };

    // If an expectedVersion is provided, require it in the filter and atomically
    // increment __v in the same update to implement optimistic concurrency.
    if (Number.isInteger(expectedVersion)) {
      filter.__v = expectedVersion;
      // Merge or add $inc: { __v: 1 }
      if (!updatePayload.$inc) updatePayload.$inc = { __v: 1 };
      else updatePayload.$inc = { ...updatePayload.$inc, __v: (updatePayload.$inc.__v || 0) + 1 };
    }

    const doc = await this.model
      .findOneAndUpdate(filter, updatePayload, {
        new: true,
        runValidators: true,
        ...options,
      })
      .lean();

    if (!doc) return { dto: null, version: null };

    const dto = normalizeUser(doc);
    const version = Number.isInteger(doc.__v) ? doc.__v : null;
    return { dto, version };
  }

  async findByUserId(userId, options = {}) {
    const { projection = null, includeSensitive = false } = options;
    const doc = await this.model.findById(userId, projection).lean();
    return normalizeUser(doc, { includeSensitive });
  }

  /**
   * Fetch normalized DTO and the raw __v version number in a single query.
   * Returns an object: { dto, version } where dto is the normalized user or null,
   * and version is the numeric __v from Mongo or null when not present.
   */
  async findByUserIdWithVersion(userId, options = {}) {
    const { projection = null, includeSensitive = false } = options;
    // Include __v in the projection so we can read the raw version alongside the doc
    const selectProjection = projection ? { ...projection } : null;
    const doc = await this.model.findById(userId, selectProjection).lean();
    if (!doc) return { dto: null, version: null };
    const dto = normalizeUser(doc, { includeSensitive });
    const version = Number.isInteger(doc.__v) ? doc.__v : null;
    return { dto, version };
  }

  async findByEmail(email, options = {}) {
    if (!email || typeof email !== "string") {
      return null;
    }

    const { projection = null, includeSensitive = false } = options;
    const normalizedEmail = email.toLowerCase().trim();
    const query = this.model.findOne({ email: normalizedEmail }, projection);
    if (includeSensitive && !projection) {
      // Explicitly include hashedPassword when requested
      query.select("+hashedPassword");
    }
    const doc = await query.lean();
    return normalizeUser(doc, { includeSensitive });
  }

  async findByProviderSub(provider, sub, options = {}) {
    if (!provider || !sub) return null;
    const { projection = null, includeSensitive = false } = options;
    const doc = await this.model.findOne({ provider, providerSub: sub }, projection).lean();
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
    const { includeSensitive = false, projection = null, new: returnNew = true } = options;
    const hasOperator = Object.keys(update || {}).some((key) => key.startsWith("$"));
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
      this.model.find(filter, projection).sort(sort).skip(skip).limit(pageSize).lean(),
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
