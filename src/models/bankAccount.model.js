const { Schema, model, Types } = require("mongoose");

/**
 * Bank Account Schema
 * Stores Expert bank account information for commission payments
 */
const BankAccountSchema = new Schema(
  {
    // Reference to Expert user
    expertId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // One bank account per expert
    },

    // Account holder information
    accountHolderName: {
      type: String,
      required: true,
      trim: true,
    },

    // Bank account number
    accountNumber: {
      type: String,
      required: true,
      trim: true,
    },

    // Bank information
    bankCode: {
      type: String,
      required: true,
      trim: true,
    },
    bankName: {
      type: String,
      required: true,
      trim: true,
    },

    // Verification status
    status: {
      type: String,
      enum: ["Pending", "Verified", "Rejected"],
      required: true,
      default: "Pending",
    },

    // Admin verification tracking
    verifiedBy: {
      type: Types.ObjectId,
      ref: "User",
    },
    verifiedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "bankAccounts",
  }
);

// Indexes
BankAccountSchema.index({ expertId: 1 });
BankAccountSchema.index({ status: 1, createdAt: -1 });

module.exports = model("BankAccount", BankAccountSchema);
