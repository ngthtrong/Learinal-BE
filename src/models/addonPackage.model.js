/**
 * Addon Package Model
 * Định nghĩa các gói mua thêm (add-on) cho learner
 * - Cộng dồn lượt tạo đề và lượt kiểm duyệt vào gói hiện tại
 * - Không có thời hạn riêng, theo chu kỳ subscription hiện tại của learner
 */
const { Schema, model } = require("mongoose");

const AddonPackageSchema = new Schema(
  {
    packageName: { 
      type: String, 
      required: true, 
      trim: true, 
      unique: true 
    },
    description: { 
      type: String,
      trim: true
    },
    price: { 
      type: Number, 
      required: true,
      min: 0
    },
    // Số lượt tạo đề được cộng thêm
    additionalTestGenerations: { 
      type: Number, 
      default: 0,
      min: 0
    },
    // Số lượt kiểm duyệt được cộng thêm
    additionalValidationRequests: { 
      type: Number, 
      default: 0,
      min: 0
    },
    // Trạng thái gói
    status: { 
      type: String, 
      enum: ["Active", "Inactive"], 
      default: "Active" 
    },
    // Loại gói: one-time (mua 1 lần) hoặc stackable (có thể mua nhiều lần)
    packageType: {
      type: String,
      enum: ["one-time", "stackable"],
      default: "stackable"
    },
    // Số lần tối đa có thể mua (0 = không giới hạn)
    maxPurchasesPerUser: {
      type: Number,
      default: 0,
      min: 0
    },
    // Thứ tự hiển thị
    displayOrder: {
      type: Number,
      default: 0
    }
  },
  { 
    timestamps: true, 
    versionKey: false, 
    collection: "addonPackages" 
  }
);

// Indexes
AddonPackageSchema.index({ status: 1, displayOrder: 1 });
AddonPackageSchema.index({ price: 1 });

module.exports = model("AddonPackage", AddonPackageSchema);
