const BaseRepository = require("./base.repository");
const { RefreshToken } = require("../models");

class RefreshTokensRepository extends BaseRepository {
  constructor() {
    super(RefreshToken);
  }

  async createRecord({
    userId,
    jti,
    userAgent,
    ip,
    deviceId,
    expiresAt,
    familyId,
    parentJti,
    tokenType = "jwt",
    tokenHash = null,
    familyIssuedAt = null,
  }) {
    const payload = {
      userId,
      jti,
      userAgent,
      ip,
      deviceId: deviceId || null,
      expiresAt,
      familyId: familyId || jti, // default a new family for first issuance
      parentJti: parentJti || null,
      tokenType,
      tokenHash,
      familyIssuedAt: familyIssuedAt || new Date(),
    };
    const doc = await this.model.create(payload);
    return this.model.findById(doc._id).lean();
  }

  async findByJti(jti) {
    return this.model.findOne({ jti }).lean();
  }

  async revokeByJti(jti) {
    return this.model.updateOne({ jti, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }

  async revokeById(id) {
    return this.model.updateOne({ _id: id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }

  async markRotated(currentJti, rotatedToJti) {
    return this.model.updateOne(
      { jti: currentJti, rotatedAt: null },
      { $set: { rotatedAt: new Date(), rotatedToJti } }
    );
  }

  async markReused(jti) {
    return this.model.updateOne({ jti }, { $set: { reusedAt: new Date() } });
  }

  async revokeFamily(userId, familyId) {
    if (!userId || !familyId) return { acknowledged: true, modifiedCount: 0 };
    return this.model.updateMany(
      { userId, familyId, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }

  async listActiveByUser(userId) {
    const now = new Date();
    return this.model
      .find({ userId, revokedAt: null, expiresAt: { $gt: now } })
      .sort({ createdAt: -1 })
      .lean();
  }

  async countActiveByUser(userId) {
    const now = new Date();
    return this.model.countDocuments({ userId, revokedAt: null, expiresAt: { $gt: now } });
  }

  async findOldestActiveByUser(userId, limit = 1) {
    const now = new Date();
    return this.model
      .find({ userId, revokedAt: null, expiresAt: { $gt: now } })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();
  }

  async revokeByIds(ids = []) {
    if (!ids?.length) return { acknowledged: true, modifiedCount: 0 };
    return this.model.updateMany(
      { _id: { $in: ids }, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }

  async doRotationAtomic(currentJti, newRecordPayload) {
    const session = await this.model.startSession();
    let created = null;
    try {
      await session.withTransaction(async () => {
        const current = await this.model.findOne({ jti: currentJti }).session(session);
        if (!current) throw new Error("Current refresh token not found");
        // Mark current rotated and revoked (idempotent on rotatedAt)
        const now = new Date();
        await this.model.updateOne(
          { _id: current._id, rotatedAt: null },
          { $set: { rotatedAt: now, rotatedToJti: newRecordPayload.jti, revokedAt: now } },
          { session }
        );
        // Ensure familyIssuedAt persists
        if (!newRecordPayload.familyIssuedAt) {
          newRecordPayload.familyIssuedAt =
            current.familyIssuedAt || current.createdAt || new Date();
        }
        // Create new token record
        const docs = await this.model.create([newRecordPayload], { session });
        created = docs && docs[0] ? docs[0].toObject() : null;
      });
    } finally {
      await session.endSession();
    }
    return created;
  }

  async isValid(jti) {
    const doc = await this.model.findOne({ jti }).lean();
    if (!doc) return false;
    if (doc.revokedAt) return false;
    if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= Date.now()) return false;
    return true;
  }
}

module.exports = RefreshTokensRepository;
