const { Schema, model, Types } = require('mongoose');

const UserSchema = new Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /.+@.+\..+/ },
  hashedPassword: { type: String, required: true },
  role: { type: String, enum: ['Learner', 'Expert', 'Admin'], required: true },
  status: { type: String, enum: ['PendingActivation', 'Active', 'Deactivated'], required: true },
  subscriptionPlanId: { type: Types.ObjectId, ref: 'SubscriptionPlan' },
  subscriptionStatus: { type: String, enum: ['None', 'Active', 'Expired', 'Cancelled'], required: true },
  subscriptionRenewalDate: { type: Date },
}, { timestamps: true, versionKey: false, collection: 'users' });

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1, status: 1, email: 1 });
UserSchema.index({ subscriptionPlanId: 1, subscriptionStatus: 1 });

module.exports = model('User', UserSchema);
