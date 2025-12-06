/**
 * User Addon Purchase Model
 * Lưu lịch sử mua gói add-on của user và tracking số lượt còn lại
 * - Thời hạn sử dụng theo chu kỳ subscription hiện tại của learner
 */
const { Schema, model, Types } = require("mongoose");

const UserAddonPurchaseSchema = new Schema(
  {
    userId: { 
      type: Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    addonPackageId: { 
      type: Types.ObjectId, 
      ref: "AddonPackage", 
      required: true 
    },
    // Snapshot thông tin gói tại thời điểm mua (để tránh thay đổi khi admin sửa gói)
    packageSnapshot: {
      packageName: { type: String, required: true },
      price: { type: Number, required: true },
      additionalTestGenerations: { type: Number, default: 0 },
      additionalValidationRequests: { type: Number, default: 0 },
      additionalDocumentUploads: { type: Number, default: 0 },
    },
    // Số lượt còn lại có thể sử dụng
    remainingTestGenerations: { 
      type: Number, 
      default: 0,
      min: 0
    },
    remainingValidationRequests: { 
      type: Number, 
      default: 0,
      min: 0
    },
    // Số lượt tải tài liệu còn lại
    remainingDocumentUploads: { 
      type: Number, 
      default: 0,
      min: 0
    },
    // Trạng thái gói add-on
    status: {
      type: String,
      enum: ["Active", "Depleted", "Expired"],
      default: "Active"
    },
    // Ngày mua
    purchaseDate: { 
      type: Date, 
      required: true, 
      default: Date.now 
    },
    // Reference đến subscription hiện tại tại thời điểm mua
    subscriptionId: {
      type: Types.ObjectId,
      ref: "UserSubscription",
      default: null
    },
    // Ngày hết hạn (theo chu kỳ subscription hiện tại của user)
    expiryDate: { 
      type: Date,
      default: null
    },
    // Reference thanh toán (transaction ID từ Sepay, etc.)
    paymentReference: {
      type: String,
      trim: true
    },
    // Số tiền đã thanh toán
    amountPaid: {
      type: Number,
      required: true
    }
  },
  { 
    timestamps: true, 
    versionKey: false, 
    collection: "userAddonPurchases" 
  }
);

// Indexes
UserAddonPurchaseSchema.index({ userId: 1, status: 1 });
UserAddonPurchaseSchema.index({ userId: 1, addonPackageId: 1 });
UserAddonPurchaseSchema.index({ expiryDate: 1, status: 1 });
UserAddonPurchaseSchema.index({ purchaseDate: -1 });

// Virtual to check if addon is usable
UserAddonPurchaseSchema.virtual("isUsable").get(function() {
  if (this.status !== "Active") return false;
  if (this.expiryDate && new Date() > this.expiryDate) return false;
  return (this.remainingTestGenerations > 0 || this.remainingValidationRequests > 0 || this.remainingDocumentUploads > 0);
});

// Method to check if has remaining quota for specific action
UserAddonPurchaseSchema.methods.hasQuotaFor = function(actionType) {
  if (this.status !== "Active") return false;
  if (this.expiryDate && new Date() > this.expiryDate) return false;
  
  if (actionType === "question_set_generation") {
    return this.remainingTestGenerations > 0;
  }
  if (actionType === "validation_request") {
    return this.remainingValidationRequests > 0;
  }
  if (actionType === "document_upload") {
    return this.remainingDocumentUploads > 0;
  }
  return false;
};

// Method to consume quota
UserAddonPurchaseSchema.methods.consumeQuota = function(actionType) {
  if (actionType === "question_set_generation" && this.remainingTestGenerations > 0) {
    this.remainingTestGenerations -= 1;
    if (this.remainingTestGenerations === 0 && this.remainingValidationRequests === 0 && this.remainingDocumentUploads === 0) {
      this.status = "Depleted";
    }
    return true;
  }
  if (actionType === "validation_request" && this.remainingValidationRequests > 0) {
    this.remainingValidationRequests -= 1;
    if (this.remainingTestGenerations === 0 && this.remainingValidationRequests === 0 && this.remainingDocumentUploads === 0) {
      this.status = "Depleted";
    }
    return true;
  }
  if (actionType === "document_upload" && this.remainingDocumentUploads > 0) {
    this.remainingDocumentUploads -= 1;
    if (this.remainingTestGenerations === 0 && this.remainingValidationRequests === 0 && this.remainingDocumentUploads === 0) {
      this.status = "Depleted";
    }
    return true;
  }
  return false;
};

module.exports = model("UserAddonPurchase", UserAddonPurchaseSchema);
