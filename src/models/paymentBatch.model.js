const { Schema, model, Types } = require("mongoose");

/**
 * Payment Batch Schema
 * Groups multiple commission records for a single payment transaction
 */
const PaymentBatchSchema = new Schema(
  {
    // Reference to Expert
    expertId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Commission records included in this batch
    commissionIds: [
      {
        type: Types.ObjectId,
        ref: "CommissionRecord",
      },
    ],

    // Payment amount
    totalAmount: {
      type: Number,
      required: true,
      min: 2000, // Minimum 2000đ
    },

    // Bank account information (snapshot at time of payment)
    bankAccount: {
      accountHolderName: String,
      accountNumber: String,
      bankCode: String,
      bankName: String,
    },

    // Sepay QR code data
    qrCode: {
      type: String,
    },

    // Payment status
    status: {
      type: String,
      enum: ["Pending", "Completed", "Cancelled"],
      required: true,
      default: "Pending",
    },

    // Admin tracking
    createdBy: {
      type: Types.ObjectId,
      ref: "User",
    },
    completedBy: {
      type: Types.ObjectId,
      ref: "User",
    },
    completedAt: {
      type: Date,
    },

    // Payment reference/note
    paymentNote: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "paymentBatches",
  }
);

// Indexes
PaymentBatchSchema.index({ expertId: 1, status: 1, createdAt: -1 });
PaymentBatchSchema.index({ status: 1, createdAt: -1 });

module.exports = model("PaymentBatch", PaymentBatchSchema);
