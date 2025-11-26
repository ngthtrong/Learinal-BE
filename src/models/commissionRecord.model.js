const { Schema, model, Types } = require("mongoose");

/**
 * Commission Record Schema
 * Tracks commission payments to Experts based on Hybrid Model (Fixed + Bonus)
 */
const CommissionRecordSchema = new Schema(
  {
    // Core references
    expertId: { type: Types.ObjectId, ref: "User", required: true },
    attemptId: { type: Types.ObjectId, ref: "QuizAttempt", required: true },
    setId: { type: Types.ObjectId, ref: "QuestionSet", required: true },
    validationRequestId: { type: Types.ObjectId, ref: "ValidationRequest" },

    // Commission type: Published (Expert created) or Validated (Expert reviewed)
    type: {
      type: String,
      enum: ["Published", "Validated"],
      required: true,
    },

    // Commission amounts (Hybrid Model)
    fixedAmount: { type: Number, required: true, default: 0 }, // Fixed rate per attempt
    bonusAmount: { type: Number, default: 0 }, // Revenue bonus (calculated in reconciliation)
    commissionAmount: { type: Number, required: true }, // Total = fixed + bonus

    // Tracking
    transactionDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["Pending", "Paid", "Cancelled"],
      required: true,
      default: "Pending",
    },

    // Premium user check (only premium attempts generate commission)
    isPremiumAttempt: { type: Boolean, default: false },

    // Payment tracking
    paidAt: { type: Date },
    paymentReference: { type: String, trim: true },

    // Reconciliation tracking
    isReconciled: { type: Boolean, default: false }, // Has bonus been calculated?
    reconciledAt: { type: Date },
    reconciliationMonth: { type: String }, // Format: "YYYY-MM"

    // Entitlement tracking (for Validated type)
    entitledUntil: { type: Date }, // When commission eligibility expires

    // Metadata
    metadata: {
      questionSetTitle: { type: String },
      learnerScore: { type: Number },
      attemptDuration: { type: Number }, // seconds
    },
  },
  { timestamps: true, versionKey: false, collection: "commissionRecords" }
);

// Indexes for efficient queries
CommissionRecordSchema.index({ expertId: 1, status: 1, transactionDate: -1 });
CommissionRecordSchema.index({ setId: 1, transactionDate: -1 });
CommissionRecordSchema.index({ expertId: 1, reconciliationMonth: 1 });
CommissionRecordSchema.index({ isReconciled: 1, status: 1 });
CommissionRecordSchema.index({ type: 1, transactionDate: -1 });
CommissionRecordSchema.index({ attemptId: 1 }, { unique: true }); // One commission per attempt

module.exports = model("CommissionRecord", CommissionRecordSchema);
