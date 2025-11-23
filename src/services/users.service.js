const { UsersRepository } = require("../repositories");

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
    if (
      typeof payload?.fullName === "string" &&
      payload.fullName.trim().length
    ) {
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
      { projection: undefined }
    );

    if (!updated) {
      const err = new Error("ETag mismatch");
      err.status = 412;
      err.code = "PreconditionFailed";
      throw err;
    }

    const etag = buildETagFrom(updated);
    return { user: mapUserDTO(updated), etag };
  }
}

module.exports = UsersService;
