const { Schema, model } = require("mongoose");

const RefreshTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    jti: { type: String, required: true, index: true, unique: true },
    // Token family for rotation/reuse detection
    familyId: { type: String, default: null, index: true },
    parentJti: { type: String, default: null, index: true },
    rotatedToJti: { type: String, default: null, index: true },
    rotatedAt: { type: Date, default: null, index: true },
    reusedAt: { type: Date, default: null, index: true },
    // Opaque token support
    tokenType: { type: String, enum: ["jwt", "opaque"], default: "jwt", index: true },
    tokenHash: { type: String, default: null },
    // Absolute lifetime support
    familyIssuedAt: { type: Date, default: null, index: true },
    deviceId: { type: String, default: null, index: true },
    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null, index: true },
  },
  {
    collection: "refresh_tokens",
    timestamps: true,
  }
);

RefreshTokenSchema.index({ userId: 1, jti: 1 }, { unique: true });
// Optimize lookups by family
RefreshTokenSchema.index({ userId: 1, familyId: 1 });
// Auto-cleanup expired refresh tokens
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Auto-cleanup revoked tokens sooner (e.g., after 7 days)
RefreshTokenSchema.index({ revokedAt: 1 }, { expireAfterSeconds: 604800 });

const transform = (_, ret) => {
  if (!ret) return ret;
  if (ret._id) {
    ret.id = ret._id.toString();
    delete ret._id;
  }
  delete ret.__v;
  return ret;
};

RefreshTokenSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform,
});
RefreshTokenSchema.set("toObject", {
  virtuals: true,
  versionKey: false,
  transform,
});

module.exports = model("RefreshToken", RefreshTokenSchema);
