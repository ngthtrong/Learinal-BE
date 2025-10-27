const { Schema, model } = require("mongoose");

const ROLES = ["Learner", "Expert", "Admin"];
const STATUSES = ["PendingActivation", "Active", "Deactivated"];
const SUBSCRIPTION_STATUSES = ["None", "Active", "Expired", "Cancelled"];

const UserSchema = new Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /.+@.+\..+/,
    },
    // Optional for OAuth-only accounts; present for local credentials
    hashedPassword: {
      type: String,
      required: false,
      default: undefined,
      select: false,
    },
    role: {
      type: String,
      enum: ROLES,
      required: true,
      default: "Learner",
    },
    status: {
      type: String,
      enum: STATUSES,
      required: true,
      default: "PendingActivation",
    },
    subscriptionPlanId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      default: null,
    },
    subscriptionStatus: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      required: true,
      default: "None",
    },
    subscriptionRenewalDate: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "users",
    timestamps: true,
  }
);

// Deprecated: userId virtual was used historically; prefer `id` in API responses.
// Keep the virtual for internal usage if needed, but remove it from API output in transform.
UserSchema.virtual("userId").get(function userIdGetter() {
  return this._id ? this._id.toHexString() : undefined;
});

const transformUser = (_, ret) => {
  if (!ret) {
    return ret;
  }

  if (ret._id) {
    const id = ret._id.toString();
    ret.id = id;
  }

  if (ret.subscriptionPlanId && ret.subscriptionPlanId.toString) {
    ret.subscriptionPlanId = ret.subscriptionPlanId.toString();
  }
  if (ret.subscriptionPlanId === undefined) {
    ret.subscriptionPlanId = null;
  }

  if (ret.subscriptionRenewalDate instanceof Date) {
    ret.subscriptionRenewalDate = ret.subscriptionRenewalDate.toISOString();
  }
  if (ret.createdAt instanceof Date) {
    ret.createdAt = ret.createdAt.toISOString();
  }
  if (ret.updatedAt instanceof Date) {
    ret.updatedAt = ret.updatedAt.toISOString();
  }

  // Ensure legacy userId field is not exposed in API responses
  if (ret.userId !== undefined) {
    delete ret.userId;
  }
  delete ret._id;
  delete ret.__v;
  delete ret.hashedPassword;

  return ret;
};

UserSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: transformUser,
});
UserSchema.set("toObject", {
  virtuals: true,
  versionKey: false,
  transform: transformUser,
});

UserSchema.index({ role: 1, status: 1, email: 1 });
UserSchema.index({ subscriptionPlanId: 1, subscriptionStatus: 1 });

module.exports = model("User", UserSchema);
