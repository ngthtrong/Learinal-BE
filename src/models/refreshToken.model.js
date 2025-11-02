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
// Auto-cleanup expired refresh tokens
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

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
