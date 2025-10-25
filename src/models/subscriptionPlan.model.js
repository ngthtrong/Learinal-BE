const { Schema, model } = require('mongoose');

const SubscriptionPlanSchema = new Schema({
  planName: { type: String, required: true, trim: true, unique: true },
  description: { type: String },
  billingCycle: { type: String, enum: ['Monthly','Yearly'], required: true },
  price: { type: Number, required: true },
  entitlements: { type: Schema.Types.Mixed },
  status: { type: String, enum: ['Active','Inactive'], default: 'Active' },
}, { timestamps: true, versionKey: false, collection: 'subscriptionPlans' });

SubscriptionPlanSchema.index({ planName: 1 }, { unique: true });

module.exports = model('SubscriptionPlan', SubscriptionPlanSchema);
