const BaseRepository = require("./base.repository");
const { RefreshToken } = require("../models");

class RefreshTokensRepository extends BaseRepository {
  constructor() {
    super(RefreshToken);
  }

  async createRecord({ userId, jti, userAgent, ip, expiresAt }) {
    const doc = await this.model.create({
      userId,
      jti,
      userAgent,
      ip,
      expiresAt,
    });
    return this.model.findById(doc._id).lean();
  }

  async findByJti(jti) {
    return this.model.findOne({ jti }).lean();
  }

  async revokeByJti(jti) {
    return this.model.updateOne(
      { jti, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }

  async isValid(jti) {
    const doc = await this.model.findOne({ jti }).lean();
    if (!doc) return false;
    if (doc.revokedAt) return false;
    if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= Date.now())
      return false;
    return true;
  }
}

module.exports = RefreshTokensRepository;
