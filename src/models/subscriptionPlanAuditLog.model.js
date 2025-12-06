const { Schema, model } = require("mongoose");

/**
 * Audit Log for Subscription Plan changes
 * Records all CREATE, UPDATE, DELETE actions on subscription plans
 */
const SubscriptionPlanAuditLogSchema = new Schema(
  {
    // Reference to the subscription plan
    planId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
      index: true,
    },
    // Action type
    action: {
      type: String,
      enum: ["CREATE", "UPDATE", "DELETE", "ARCHIVE", "RESTORE"],
      required: true,
    },
    // Who made the change
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Timestamp of the change
    changedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // Snapshot of data BEFORE the change (null for CREATE)
    previousData: {
      type: Schema.Types.Mixed,
      default: null,
    },
    // Snapshot of data AFTER the change (null for DELETE)
    newData: {
      type: Schema.Types.Mixed,
      default: null,
    },
    // List of fields that were changed (for UPDATE actions)
    changedFields: {
      type: [String],
      default: [],
    },
    // Optional reason/note for the change
    reason: {
      type: String,
      default: null,
    },
    // IP address of the requester (optional, for security audit)
    ipAddress: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: false, // We use changedAt instead
    versionKey: false,
    collection: "subscriptionPlanAuditLogs",
  }
);

// Compound indexes for efficient querying
SubscriptionPlanAuditLogSchema.index({ planId: 1, changedAt: -1 });
SubscriptionPlanAuditLogSchema.index({ changedBy: 1, changedAt: -1 });
SubscriptionPlanAuditLogSchema.index({ action: 1, changedAt: -1 });

module.exports = model("SubscriptionPlanAuditLog", SubscriptionPlanAuditLogSchema);
