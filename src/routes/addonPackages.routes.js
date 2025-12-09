/**
 * Addon Packages Routes
 * API endpoints cho gói add-on
 */
const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const authorizeRole = require("../middleware/authorizeRole");
const addonPackagesController = require("../controllers/addonPackages.controller");

const router = express.Router();

// ==================== PUBLIC ROUTES (Cần đăng nhập) ====================

// Lấy danh sách gói add-on đang active
router.get("/", authenticateJWT, addonPackagesController.getActivePackages);

// Lấy chi tiết gói add-on
router.get("/details/:id", authenticateJWT, addonPackagesController.getPackageById);

// ==================== USER ROUTES ====================

// Lấy danh sách add-on đã mua của user
router.get("/my-addons", authenticateJWT, addonPackagesController.getMyAddons);

// Lấy tổng quota add-on còn lại
router.get("/my-quota", authenticateJWT, addonPackagesController.getMyAddonQuota);

// Tạo QR thanh toán cho gói add-on
router.post("/:id/generate-qr", authenticateJWT, addonPackagesController.generatePaymentQR);

// ==================== ADMIN ROUTES ====================

// Lấy tất cả gói add-on (có phân trang)
router.get(
  "/admin/all",
  authenticateJWT,
  authorizeRole("Admin"),
  addonPackagesController.adminGetAllPackages
);

// Tạo gói add-on mới
router.post(
  "/admin",
  authenticateJWT,
  authorizeRole("Admin"),
  addonPackagesController.adminCreatePackage
);

// Cập nhật gói add-on
router.put(
  "/admin/:id",
  authenticateJWT,
  authorizeRole("Admin"),
  addonPackagesController.adminUpdatePackage
);

// Xóa gói add-on
router.delete(
  "/admin/:id",
  authenticateJWT,
  authorizeRole("Admin"),
  addonPackagesController.adminDeletePackage
);

module.exports = router;
