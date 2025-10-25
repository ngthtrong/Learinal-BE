const { Schema, model, Types } = require('mongoose');

const UserSubscriptionSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', required: true },
  planId: { type: Types.ObjectId, ref: 'SubscriptionPlan', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  renewalDate: { type: Date },
  status: { type: String, enum: ['Active','Expired','Cancelled','PendingPayment'], required: true },
  entitlementsSnapshot: { type: Schema.Types.Mixed },
}, { timestamps: true, versionKey: false, collection: 'userSubscriptions' });

UserSubscriptionSchema.index({ userId: 1, status: 1, startDate: -1 });
UserSubscriptionSchema.index({ planId: 1, status: 1 });

module.exports = model('UserSubscription', UserSubscriptionSchema);
