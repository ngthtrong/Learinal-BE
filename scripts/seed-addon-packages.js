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
  // ==================== GÓI TẠO ĐỀ ====================
  {
    packageName: "Tạo Đề Mini",
    description: "Thêm 1 lượt tạo bộ đề mới. Phù hợp khi cần bổ sung nhanh.",
    price: 5000, // 5,000đ
    additionalTestGenerations: 1,
    additionalValidationRequests: 0,
    packageType: "stackable",
    maxPurchasesPerUser: 0,
    displayOrder: 1,
    status: "Active",
  },
  {
    packageName: "Tạo Đề Tiêu Chuẩn",
    description: "Thêm 5 lượt tạo đề - Tiết kiệm 10%. Lựa chọn phổ biến nhất!",
    price: 22500, // 22,500đ (gốc 25,000đ)
    additionalTestGenerations: 5,
    additionalValidationRequests: 0,
    packageType: "stackable",
    maxPurchasesPerUser: 0,
    displayOrder: 2,
    status: "Active",
  },
  {
    packageName: "🚀 Tạo Đề Pro",
    description: "Thêm 10 lượt tạo đề - Tiết kiệm 20%. Dành cho người học chăm chỉ!",
    price: 40000, // 40,000đ (gốc 50,000đ)
    additionalTestGenerations: 10,
    additionalValidationRequests: 0,
    packageType: "stackable",
    maxPurchasesPerUser: 0,
    displayOrder: 3,
    status: "Active",
  },

  // ==================== GÓI KIỂM DUYỆT ====================
  {
    packageName: "✅ Kiểm Duyệt Mini",
    description: "Thêm 1 lượt gửi yêu cầu kiểm duyệt bộ đề từ chuyên gia.",
    price: 3000, // 3,000đ
    additionalTestGenerations: 0,
    additionalValidationRequests: 1,
    packageType: "stackable",
    maxPurchasesPerUser: 0,
    displayOrder: 4,
    status: "Active",
  },
  {
    packageName: "🏆 Kiểm Duyệt Pro",
    description: "Thêm 5 lượt kiểm duyệt - Tiết kiệm 15%. Đảm bảo chất lượng bộ đề!",
    price: 12750, // 12,750đ (gốc 15,000đ)
    additionalTestGenerations: 0,
    additionalValidationRequests: 5,
    packageType: "stackable",
    maxPurchasesPerUser: 0,
    displayOrder: 5,
    status: "Active",
  },

  // ==================== GÓI COMBO ====================
  {
    packageName: "💎 Combo Học Tập",
    description: "3 lượt tạo đề + 2 lượt kiểm duyệt - Tiết kiệm 25%. Gói tiện lợi nhất!",
    price: 16500, // 16,500đ (gốc 21,000đ = 15,000đ + 6,000đ)
    additionalTestGenerations: 3,
    additionalValidationRequests: 2,
    packageType: "stackable",
    maxPurchasesPerUser: 0,
    displayOrder: 6,
    status: "Active",
  },
  {
    packageName: "👑 Combo Siêu Tiết Kiệm",
    description: "10 lượt tạo đề + 5 lượt kiểm duyệt - Tiết kiệm 30%. Best value!",
    price: 45500, // 45,500đ (gốc 65,000đ = 50,000đ + 15,000đ)
    additionalTestGenerations: 10,
    additionalValidationRequests: 5,
    packageType: "stackable",
    maxPurchasesPerUser: 0,
    displayOrder: 7,
    status: "Active",
  },

  // ==================== GÓI LÀM QUIZ ====================
  {
    packageName: "🎮 Luyện Tập Thêm",
    description: "Thêm 20 lượt làm quiz. Luyện tập thêm, tiến bộ thêm!",
    price: 9000, // 9,000đ
    additionalTestGenerations: 0,
    additionalValidationRequests: 0,
    additionalQuizAttempts: 20,
    packageType: "stackable",
    maxPurchasesPerUser: 0,
    displayOrder: 8,
    status: "Active",
  },
  {
    packageName: "⚡ Luyện Tập Không Giới Hạn",
    description: "Thêm 50 lượt làm quiz - Tiết kiệm 20%. Ôn thi marathon!",
    price: 18000, // 18,000đ (gốc 22,500đ)
    additionalTestGenerations: 0,
    additionalValidationRequests: 0,
    additionalQuizAttempts: 50,
    packageType: "stackable",
    maxPurchasesPerUser: 0,
    displayOrder: 9,
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
