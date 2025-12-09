const { Schema, model, Types } = require("mongoose");

const UsageTrackingSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    actionType: {
      type: String,
      enum: ["question_set_generation", "validation_request", "document_upload"],
      required: true,
    },
    resourceId: { type: Types.ObjectId }, // ID của question set, validation request hoặc document
    timestamp: { type: Date, required: true, default: Date.now, index: true },
    metadata: { type: Schema.Types.Mixed }, // Thông tin bổ sung nếu cần
  },
  { timestamps: false, versionKey: false, collection: "usageTracking" }
);

// Compound index for efficient queries
UsageTrackingSchema.index({ userId: 1, actionType: 1, timestamp: -1 });

module.exports = model("UsageTracking", UsageTrackingSchema);
