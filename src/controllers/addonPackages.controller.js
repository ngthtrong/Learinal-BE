/**
 * Addon Packages Controller
 * API endpoints cho gói add-on
 */
const QRCode = require("qrcode");
const { sepay } = require("../config");
const createSepayClient = require("../adapters/sepayClient");
const logger = require("../utils/logger");

module.exports = {
  // ==================== PUBLIC ENDPOINTS (User) ====================

  /**
   * GET /addon-packages
   * Lấy danh sách gói add-on đang active
   */
  getActivePackages: async (req, res, next) => {
    try {
      const { addonPackagesService } = req.app.locals;
      const packages = await addonPackagesService.getActivePackages();
      
      return res.status(200).json({
        packages: packages.map(pkg => ({
          id: pkg._id,
          packageName: pkg.packageName,
          description: pkg.description,
          price: pkg.price,
          additionalTestGenerations: pkg.additionalTestGenerations,
          additionalValidationRequests: pkg.additionalValidationRequests,
          validityDays: pkg.validityDays,
          packageType: pkg.packageType,
          displayOrder: pkg.displayOrder
        }))
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /addon-packages/:id
   * Lấy chi tiết gói add-on
   */
  getPackageById: async (req, res, next) => {
    try {
      const { addonPackagesService } = req.app.locals;
      const pkg = await addonPackagesService.getPackageById(req.params.id);
      
      return res.status(200).json({
        id: pkg._id,
        packageName: pkg.packageName,
        description: pkg.description,
        price: pkg.price,
        additionalTestGenerations: pkg.additionalTestGenerations,
        additionalValidationRequests: pkg.additionalValidationRequests,
        validityDays: pkg.validityDays,
        packageType: pkg.packageType,
        status: pkg.status,
        displayOrder: pkg.displayOrder
      });
    } catch (err) {
      next(err);
    }
  },

  // ==================== USER ADDON PURCHASES ====================

  /**
   * GET /addon-packages/my-addons
   * Lấy danh sách add-on đã mua của user hiện tại
   */
  getMyAddons: async (req, res, next) => {
    try {
      const { addonPackagesService } = req.app.locals;
      const userId = req.user.id;
      const { status, page = 1, pageSize = 20 } = req.query;

      const result = await addonPackagesService.getUserAddons(userId, {
        status,
        page: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10)
      });

      return res.status(200).json({
        purchases: result.purchases.map(p => ({
          id: p._id,
          packageName: p.packageSnapshot?.packageName || p.addonPackageId?.packageName,
          purchaseDate: p.purchaseDate,
          expiryDate: p.expiryDate,
          remainingTestGenerations: p.remainingTestGenerations,
          remainingValidationRequests: p.remainingValidationRequests,
          status: p.status,
          amountPaid: p.amountPaid
        })),
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /addon-packages/my-quota
   * Lấy tổng quota add-on còn lại của user
   */
  getMyAddonQuota: async (req, res, next) => {
    try {
      const { addonPackagesService } = req.app.locals;
      const userId = req.user.id;

      const quota = await addonPackagesService.getUserAddonQuota(userId);

      return res.status(200).json({
        totalTestGenerations: quota.totalTestGenerations,
        totalValidationRequests: quota.totalValidationRequests
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /addon-packages/:id/generate-qr
   * Tạo QR thanh toán cho gói add-on
   */
  generatePaymentQR: async (req, res, next) => {
    try {
      const { addonPackagesService } = req.app.locals;
      const userId = req.user?.id;
      const addonPackageId = req.params.id;

      if (!userId) {
        return res.status(401).json({ code: "Unauthorized", message: "Missing user" });
      }

      // Lấy thông tin gói add-on
      const pkg = await addonPackagesService.getPackageById(addonPackageId);
      
      if (pkg.status !== "Active") {
        return res.status(400).json({
          code: "PackageInactive",
          message: "Gói add-on này hiện không khả dụng"
        });
      }

      const amount = pkg.price;
      const currency = "VND";

      // Rút gọn description để tránh bị cắt bởi ngân hàng
      // Format ngắn: SEVQR AD uid<24hex> ad<24hex>
      const description = `SEVQR AD uid${userId} ad${addonPackageId}`;

      // Reference string (for internal use)
      const reference = `uid:${userId}|ad:${addonPackageId}|amt:${amount}|ts:${Date.now()}`;

      let qrUrl;
      if (sepay?.qrAccount && sepay?.qrBank) {
        const base = sepay.qrImgBase || "https://qr.sepay.vn/img";
        const acc = encodeURIComponent(sepay.qrAccount);
        const bank = encodeURIComponent(sepay.qrBank);
        const tmpl = encodeURIComponent(sepay.qrTemplate || "compact");
        const encDes = encodeURIComponent(description).replace(/%20/g, "+");
        qrUrl = `${base}?acc=${acc}&bank=${bank}&amount=${amount}&des=${encDes}&template=${tmpl}`;
      }

      let qrDataUrl;
      if (!qrUrl && sepay?.apiKey) {
        try {
          const client = createSepayClient(sepay);
          const created = await client.createDynamicQR({
            amount,
            currency,
            reference,
            description: packageName,
          });
          if (created.qrDataUrl) {
            qrDataUrl = created.qrDataUrl;
          } else if (created.qrContent) {
            qrDataUrl = await QRCode.toDataURL(created.qrContent, { errorCorrectionLevel: "M" });
          }
        } catch (_err) {
          // ignore and fallback
        }
      }

      if (!qrUrl && !qrDataUrl) {
        const payload = `SEPAY|ref=${reference}|content=${packageName}|currency=${currency}`;
        qrDataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M" });
      }

      logger.info(
        { userId, addonPackageId, packageName: pkg.packageName, amount },
        "[AddonController] Generated payment QR"
      );

      return res.status(200).json({
        provider: "sepay",
        amount,
        currency,
        addon: {
          id: addonPackageId,
          name: pkg.packageName,
          testGenerations: pkg.additionalTestGenerations,
          validationRequests: pkg.additionalValidationRequests
        },
        reference,
        // Để frontend dùng được
        qrCodeUrl: qrUrl || qrDataUrl,
        qrUrl,
        qrDataUrl,
        // Thông tin ngân hàng
        bankName: sepay?.qrBank || "MB Bank",
        accountNumber: sepay?.qrAccount || "",
        accountName: process.env.SEPAY_ACCOUNT_NAME || "LEARINAL",
        transferContent: description
      });
    } catch (err) {
      next(err);
    }
  },

  // ==================== ADMIN ENDPOINTS ====================

  /**
   * GET /admin/addon-packages
   * Lấy tất cả gói add-on (có phân trang)
   */
  adminGetAllPackages: async (req, res, next) => {
    try {
      const { addonPackagesService } = req.app.locals;
      const { status, page = 1, pageSize = 20 } = req.query;

      const result = await addonPackagesService.getAllPackages({
        status,
        page: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10)
      });

      return res.status(200).json({
        packages: result.items.map(pkg => ({
          id: pkg._id,
          packageName: pkg.packageName,
          description: pkg.description,
          price: pkg.price,
          additionalTestGenerations: pkg.additionalTestGenerations,
          additionalValidationRequests: pkg.additionalValidationRequests,
          validityDays: pkg.validityDays,
          packageType: pkg.packageType,
          maxPurchasesPerUser: pkg.maxPurchasesPerUser,
          status: pkg.status,
          displayOrder: pkg.displayOrder,
          createdAt: pkg.createdAt,
          updatedAt: pkg.updatedAt
        })),
        pagination: result.meta
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/addon-packages
   * Tạo gói add-on mới
   */
  adminCreatePackage: async (req, res, next) => {
    try {
      const { addonPackagesService } = req.app.locals;
      const {
        packageName,
        description,
        price,
        additionalTestGenerations = 0,
        additionalValidationRequests = 0,
        validityDays = 0,
        packageType = "stackable",
        maxPurchasesPerUser = 0,
        displayOrder = 0,
        status = "Active"
      } = req.body;

      // Validation
      if (!packageName || typeof packageName !== "string") {
        return res.status(400).json({
          code: "ValidationError",
          message: "packageName is required"
        });
      }

      if (typeof price !== "number" || price < 0) {
        return res.status(400).json({
          code: "ValidationError",
          message: "price must be a non-negative number"
        });
      }

      const pkg = await addonPackagesService.createPackage({
        packageName: packageName.trim(),
        description: description?.trim(),
        price,
        additionalTestGenerations,
        additionalValidationRequests,
        validityDays,
        packageType,
        maxPurchasesPerUser,
        displayOrder,
        status
      });

      logger.info(
        { packageId: pkg._id, packageName: pkg.packageName, adminId: req.user?.id },
        "[AddonController] Admin created addon package"
      );

      return res.status(201).json({
        message: "Tạo gói add-on thành công",
        package: {
          id: pkg._id,
          packageName: pkg.packageName,
          description: pkg.description,
          price: pkg.price,
          additionalTestGenerations: pkg.additionalTestGenerations,
          additionalValidationRequests: pkg.additionalValidationRequests,
          validityDays: pkg.validityDays,
          packageType: pkg.packageType,
          status: pkg.status
        }
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /admin/addon-packages/:id
   * Cập nhật gói add-on
   */
  adminUpdatePackage: async (req, res, next) => {
    try {
      const { addonPackagesService } = req.app.locals;
      const packageId = req.params.id;

      const updateData = {};
      const allowedFields = [
        "packageName", "description", "price",
        "additionalTestGenerations", "additionalValidationRequests",
        "validityDays", "packageType", "maxPurchasesPerUser",
        "displayOrder", "status"
      ];

      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      if (updateData.packageName) {
        updateData.packageName = updateData.packageName.trim();
      }
      if (updateData.description) {
        updateData.description = updateData.description.trim();
      }

      const pkg = await addonPackagesService.updatePackage(packageId, updateData);

      logger.info(
        { packageId, updatedFields: Object.keys(updateData), adminId: req.user?.id },
        "[AddonController] Admin updated addon package"
      );

      return res.status(200).json({
        message: "Cập nhật gói add-on thành công",
        package: {
          id: pkg._id,
          packageName: pkg.packageName,
          description: pkg.description,
          price: pkg.price,
          additionalTestGenerations: pkg.additionalTestGenerations,
          additionalValidationRequests: pkg.additionalValidationRequests,
          validityDays: pkg.validityDays,
          packageType: pkg.packageType,
          maxPurchasesPerUser: pkg.maxPurchasesPerUser,
          status: pkg.status,
          displayOrder: pkg.displayOrder
        }
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /admin/addon-packages/:id
   * Xóa gói add-on (hoặc inactive)
   */
  adminDeletePackage: async (req, res, next) => {
    try {
      const { addonPackagesService } = req.app.locals;
      const packageId = req.params.id;
      const { softDelete = true } = req.query;

      if (softDelete === true || softDelete === "true") {
        // Soft delete - just set inactive
        await addonPackagesService.updatePackage(packageId, { status: "Inactive" });
        
        logger.info(
          { packageId, adminId: req.user?.id },
          "[AddonController] Admin soft-deleted addon package"
        );

        return res.status(200).json({
          message: "Đã vô hiệu hóa gói add-on"
        });
      } else {
        // Hard delete
        await addonPackagesService.deletePackage(packageId);
        
        logger.info(
          { packageId, adminId: req.user?.id },
          "[AddonController] Admin hard-deleted addon package"
        );

        return res.status(200).json({
          message: "Đã xóa gói add-on"
        });
      }
    } catch (err) {
      next(err);
    }
  }
};
