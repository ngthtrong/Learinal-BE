/**
 * Processed Transaction Model
 * Lưu lại các transaction đã được xử lý để tránh xử lý trùng lặp
 * Dùng cho cả subscription và addon purchases
 */
const { Schema, model } = require("mongoose");

const ProcessedTransactionSchema = new Schema(
  {
    // Transaction ID từ Sepay
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    // Loại transaction: subscription hoặc addon
    type: {
      type: String,
      enum: ["subscription", "addon"],
      required: true
    },
    // User ID liên quan
    userId: {
      type: String,
      required: true
    },
    // Reference ID (planId hoặc addonId)
    referenceId: {
      type: String,
      required: true
    },
    // Số tiền
    amount: {
      type: Number,
      required: true
    },
    // Nội dung giao dịch gốc
    content: {
      type: String
    },
    // Kết quả xử lý
    result: {
      type: String,
      enum: ["activated", "skipped", "error"],
      default: "activated"
    },
    // Ghi chú
    note: {
      type: String
    }
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "processedTransactions"
  }
);

// TTL index - tự động xóa sau 90 ngày
ProcessedTransactionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = model("ProcessedTransaction", ProcessedTransactionSchema);
