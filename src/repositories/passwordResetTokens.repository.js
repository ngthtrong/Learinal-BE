const BaseRepository = require("./base.repository");
const { PasswordResetToken } = require("../models");

class PasswordResetTokensRepository extends BaseRepository {
  constructor() {
    super(PasswordResetToken);
  }

  async createRecord({ userId, jti, expiresAt }) {
    const doc = await this.model.create({ userId, jti, expiresAt });
    return this.model.findById(doc._id).lean();
  }

  async findByJti(jti) {
    return this.model.findOne({ jti }).lean();
  }

  async isUsable(jti) {
    const doc = await this.model.findOne({ jti }).lean();
    if (!doc) return false;
    if (doc.usedAt) return false;
    if (!doc.expiresAt || new Date(doc.expiresAt).getTime() <= Date.now()) return false;
    return true;
  }

  async markUsed(jti) {
    return this.model.updateOne({ jti, usedAt: null }, { $set: { usedAt: new Date() } });
  }

  static singleton() {
    if (!this._instance) this._instance = new PasswordResetTokensRepository();
    return this._instance;
  }
}

module.exports = PasswordResetTokensRepository;
