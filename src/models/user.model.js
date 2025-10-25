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
    hashedPassword: {
      type: String,
      required: true,
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
    ret.userId = id;
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

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1, status: 1, email: 1 });
UserSchema.index({ subscriptionPlanId: 1, subscriptionStatus: 1 });

module.exports = model("User", UserSchema);
