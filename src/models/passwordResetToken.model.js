const { Schema, model } = require("mongoose");

const PasswordResetTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jti: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null, index: true },
  },
  { collection: "password_reset_tokens", timestamps: true }
);

PasswordResetTokenSchema.index({ userId: 1, jti: 1 }, { unique: true });
// Auto-cleanup expired password reset tokens
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const transform = (_, ret) => {
  if (!ret) return ret;
  if (ret._id) {
    ret.id = ret._id.toString();
    delete ret._id;
  }
  delete ret.__v;
  return ret;
};

PasswordResetTokenSchema.set("toJSON", { virtuals: true, versionKey: false, transform });
PasswordResetTokenSchema.set("toObject", { virtuals: true, versionKey: false, transform });

module.exports = model("PasswordResetToken", PasswordResetTokenSchema);
