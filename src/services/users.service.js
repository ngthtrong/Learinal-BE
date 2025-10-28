const { UsersRepository } = require("../repositories");
const logger = require("../utils/logger");

function toISO(value) {
  if (!value) return value === undefined ? undefined : null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function asStringId(value) {
  if (!value) return undefined;
  return value.toString ? value.toString() : String(value);
}

function mapUserDTO(doc) {
  if (!doc) return null;
  const id = doc._id?.toString?.() || doc.id || doc.userId;

  // Build the DTO in the desired display order: id first, then core fields
  const dto = {
    id,
    fullName: doc.fullName,
    email: doc.email,
    role: doc.role,
    status: doc.status,
    subscriptionPlanId:
      doc.subscriptionPlanId === undefined
        ? null
        : asStringId(doc.subscriptionPlanId) ?? null,
    subscriptionStatus: doc.subscriptionStatus,
    subscriptionRenewalDate: toISO(doc.subscriptionRenewalDate) ?? null,
    createdAt: toISO(doc.createdAt),
    updatedAt: toISO(doc.updatedAt),
  };

  // Ensure sensitive/internal fields are not present
  // (We are constructing from scratch, so hashedPassword/__v/_id won't be included.)

  return dto;
}

function buildETagFrom(user) {
  const v = typeof user.__v === "number" ? user.__v : undefined;
  return typeof v === "number" ? `W/"v${v}"` : undefined;
}

function parseIfNoneMatch(headerValue) {
  if (!headerValue || typeof headerValue !== "string") return null;
  const m = headerValue.match(/W\/"v(\d+)"/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

class UsersService {
  constructor({ usersRepository } = {}) {
    this.usersRepository = usersRepository || new UsersRepository();
  }

  /**
   * Get current user profile
   */
  async getMe(userId) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      err.code = "NotFound";
      throw err;
    }
    const etag = buildETagFrom(user);
    return { user: mapUserDTO(user), etag };
  }

  /**
   * Update current user profile (with optimistic locking via ETag)
   */
  async updateMe(userId, payload, ifNoneMatch) {
    const expectedV = parseIfNoneMatch(ifNoneMatch);
    if (expectedV === null || Number.isNaN(expectedV)) {
      const err = new Error("Validation failed");
      err.status = 400;
      err.code = "ValidationError";
      err.details = { "If-None-Match": 'required (format: W/"v<number>")' };
      throw err;
    }

    // Whitelist updatable fields
    const update = {};
    if (typeof payload?.fullName === "string" && payload.fullName.trim().length) {
      update.fullName = payload.fullName.trim();
    }

    if (Object.keys(update).length === 0) {
      const err = new Error("Validation failed");
      err.status = 400;
      err.code = "ValidationError";
      err.details = { payload: "no updatable fields" };
      throw err;
    }

    const updated = await this.usersRepository.updateByIdWithVersion(
      userId,
      { $set: update, $inc: { __v: 1 } },
      expectedV,
      { new: true, runValidators: true }
    );

    if (!updated || !updated.dto) {
      const err = new Error("Precondition failed");
      err.status = 412;
      err.code = "PreconditionFailed";
      err.details = { message: "ETag mismatch or concurrent modification" };
      throw err;
    }

    logger.info({ userId, fields: Object.keys(update) }, "User profile updated");

    const etag = updated.version !== undefined ? `W/"v${updated.version}"` : undefined;
    return { user: mapUserDTO(updated.dto), etag };
  }

  /**
   * List all users (Admin only)
   * @param {Object} params - Query parameters
   * @param {number} params.page - Page number (default: 1)
   * @param {number} params.pageSize - Items per page (default: 20)
   * @param {string} params.role - Filter by role
   * @param {string} params.status - Filter by status
   * @param {string} params.email - Search by email (partial match)
   * @param {string} params.sort - Sort field (e.g., "-createdAt")
   */
  async listUsers({ page = 1, pageSize = 20, role, status, email, sort = "-createdAt" } = {}) {
    // Validate pagination
    const p = parseInt(page, 10) || 1;
    const ps = parseInt(pageSize, 10) || 20;

    if (p < 1 || ps < 1 || ps > 100) {
      const err = new Error("Validation failed");
      err.status = 400;
      err.code = "ValidationError";
      err.details = { 
        page: p < 1 ? "must be >= 1" : undefined,
        pageSize: ps < 1 || ps > 100 ? "must be 1-100" : undefined,
      };
      throw err;
    }

    // Build filter
    const filter = {};
    if (role) {
      filter.role = role;
    }
    if (status) {
      filter.status = status;
    }
    if (email) {
      // Case-insensitive partial match
      filter.email = { $regex: email, $options: "i" };
    }

    // Parse sort
    const sortField = sort.startsWith("-") ? sort.substring(1) : sort;
    const sortOrder = sort.startsWith("-") ? -1 : 1;
    const sortObj = { [sortField]: sortOrder };

    // Execute query
    const skip = (p - 1) * ps;
    const [items, totalItems] = await Promise.all([
      this.usersRepository.model
        .find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(ps)
        .select("-hashedPassword -__v")
        .lean(),
      this.usersRepository.model.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalItems / ps);

    logger.info({ 
      filter, 
      page: p, 
      pageSize: ps, 
      totalItems 
    }, "Users listed");

    return {
      items: items.map(mapUserDTO),
      meta: {
        page: p,
        pageSize: ps,
        totalItems,
        totalPages,
      },
    };
  }

  /**
   * Get user by ID (Admin only)
   */
  async getUserById(userId) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      err.code = "NotFound";
      throw err;
    }
    return mapUserDTO(user);
  }

  /**
   * Update user by ID (Admin only)
   */
  async updateUserById(userId, payload) {
    // Whitelist updatable fields for admin
    const update = {};
    
    if (typeof payload?.fullName === "string") {
      update.fullName = payload.fullName.trim();
    }
    if (typeof payload?.role === "string") {
      update.role = payload.role;
    }
    if (typeof payload?.status === "string") {
      update.status = payload.status;
    }
    if (payload?.subscriptionPlanId !== undefined) {
      update.subscriptionPlanId = payload.subscriptionPlanId || null;
    }
    if (typeof payload?.subscriptionStatus === "string") {
      update.subscriptionStatus = payload.subscriptionStatus;
    }
    if (payload?.subscriptionRenewalDate !== undefined) {
      update.subscriptionRenewalDate = payload.subscriptionRenewalDate 
        ? new Date(payload.subscriptionRenewalDate) 
        : null;
    }

    if (Object.keys(update).length === 0) {
      const err = new Error("Validation failed");
      err.status = 400;
      err.code = "ValidationError";
      err.details = { payload: "no updatable fields" };
      throw err;
    }

    const updated = await this.usersRepository.updateById(userId, update);
    if (!updated) {
      const err = new Error("User not found");
      err.status = 404;
      err.code = "NotFound";
      throw err;
    }

    logger.info({ userId, adminUpdate: true, fields: Object.keys(update) }, "User updated by admin");

    return mapUserDTO(updated);
  }

  /**
   * Delete user by ID (Admin only - soft delete)
   */
  async deleteUserById(userId) {
    // Soft delete: set status to Deactivated
    const updated = await this.usersRepository.updateById(userId, { 
      status: "Deactivated" 
    });
    
    if (!updated) {
      const err = new Error("User not found");
      err.status = 404;
      err.code = "NotFound";
      throw err;
    }

    logger.info({ userId }, "User deactivated");

    return { message: "User deactivated successfully" };
  }
}

module.exports = UsersService;
