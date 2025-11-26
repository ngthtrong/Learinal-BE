/**
 * Seed script: Create initial addon packages
 * Run: node scripts/seed-addon-packages.js
 * 
 * Lưu ý: Gói add-on không có thời hạn riêng, sẽ theo chu kỳ subscription hiện tại của learner
 */

require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../src/config/env");
const AddonPackage = require("../src/models/addonPackage.model");

const addonPackages = [
  {
    packageName: "Thêm 1 lượt tạo đề",
    description: "Cộng thêm 1 lượt tạo đề vào gói hiện tại của bạn",
    price: 500, // 500đ
    additionalTestGenerations: 1,
    additionalValidationRequests: 0,
    packageType: "stackable",
    maxPurchasesPerUser: 0, // Không giới hạn
    displayOrder: 1,
    status: "Active",
  },
  {
    packageName: "Thêm 3 lượt tạo đề",
    description: "Cộng thêm 3 lượt tạo đề vào gói hiện tại của bạn - Tiết kiệm 10%",
    price: 1350, // 1350đ (giá gốc 1500đ)
    additionalTestGenerations: 3,
    additionalValidationRequests: 0,
    packageType: "stackable",
    maxPurchasesPerUser: 0,
    displayOrder: 2,
    status: "Active",
  },
  {
    packageName: "Thêm 5 lượt tạo đề",
    description: "Cộng thêm 5 lượt tạo đề vào gói hiện tại của bạn - Tiết kiệm 15%",
    price: 2125, // 2125đ (giá gốc 2500đ)
    additionalTestGenerations: 5,
    additionalValidationRequests: 0,
    packageType: "stackable",
    maxPurchasesPerUser: 0,
    displayOrder: 3,
    status: "Active",
  },
  {
    packageName: "Thêm 1 lượt kiểm duyệt",
    description: "Cộng thêm 1 lượt gửi yêu cầu kiểm duyệt vào gói hiện tại của bạn",
    price: 300, // 300đ
    additionalTestGenerations: 0,
    additionalValidationRequests: 1,
    packageType: "stackable",
    maxPurchasesPerUser: 0,
    displayOrder: 4,
    status: "Active",
  },
  {
    packageName: "Thêm 5 lượt kiểm duyệt",
    description: "Cộng thêm 5 lượt gửi yêu cầu kiểm duyệt - Tiết kiệm 15%",
    price: 1275, // 1275đ (giá gốc 1500đ)
    additionalTestGenerations: 0,
    additionalValidationRequests: 5,
    packageType: "stackable",
    maxPurchasesPerUser: 0,
    displayOrder: 5,
    status: "Active",
  },
  {
    packageName: "Combo Tạo đề + Kiểm duyệt",
    description: "3 lượt tạo đề + 2 lượt kiểm duyệt - Tiết kiệm 20%",
    price: 1680, // 1680đ (giá gốc 2100đ)
    additionalTestGenerations: 3,
    additionalValidationRequests: 2,
    packageType: "stackable",
    maxPurchasesPerUser: 0,
    displayOrder: 6,
    status: "Active",
  },
];

async function seed() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName });
    console.log("Connected to MongoDB");

    console.log("Clearing existing addon packages...");
    await AddonPackage.deleteMany({});

    console.log("Creating addon packages...");
    const created = await AddonPackage.insertMany(addonPackages);

    console.log(`✓ Created ${created.length} addon packages:`);
    created.forEach((pkg) => {
      const features = [];
      if (pkg.additionalTestGenerations > 0) {
        features.push(`${pkg.additionalTestGenerations} lượt tạo đề`);
      }
      if (pkg.additionalValidationRequests > 0) {
        features.push(`${pkg.additionalValidationRequests} lượt kiểm duyệt`);
      }
      const validity = pkg.validityDays > 0 ? ` (hết hạn sau ${pkg.validityDays} ngày)` : " (không hết hạn)";
      console.log(
        `  - ${pkg.packageName}: ${pkg.price}đ - ${features.join(" + ")}${validity}`
      );
    });

    console.log("\nSeed completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

seed();
