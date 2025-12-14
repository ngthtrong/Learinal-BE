const { sepay } = require("../config");
const createSepayClient = require("../adapters/sepayClient");
const logger = require("../utils/logger");

class PaymentBatchService {
  constructor({ 
    paymentBatchesRepository, 
    commissionRecordsRepository, 
    bankAccountsRepository,
    notificationService
  }) {
    this.paymentBatchesRepository = paymentBatchesRepository;
    this.commissionRecordsRepository = commissionRecordsRepository;
    this.bankAccountsRepository = bankAccountsRepository;
    this.notificationService = notificationService;
  }

  /**
   * Create a payment batch for an expert's pending commissions
   */
  async createBatchForExpert(expertId, adminId) {
    // Get expert's verified bank account
    const bankAccount = await this.bankAccountsRepository.findByExpertId(expertId);
    if (!bankAccount) {
      throw new Error("Chuyên gia chưa liên kết tài khoản ngân hàng");
    }
    if (bankAccount.status !== "Verified") {
      throw new Error("Tài khoản ngân hàng chưa được xác minh");
    }

    // Get all pending commissions for this expert
    const pendingCommissions = await this.commissionRecordsRepository.findByExpertAndStatus(
      expertId,
      "Pending"
    );

    if (!pendingCommissions || pendingCommissions.length === 0) {
      throw new Error("Không có hoa hồng nào đang chờ thanh toán");
    }

    // Calculate total amount
    const totalAmount = pendingCommissions.reduce(
      (sum, c) => sum + (c.commissionAmount || 0),
      0
    );

    // Validate minimum amount
    if (totalAmount < 2000) {
      throw new Error("Tổng số tiền phải từ 2,000đ trở lên");
    }

    // Generate QR code
    const commissionIds = pendingCommissions.map((c) => c._id || c.id);
    const description = `SEVQR COMM uid${expertId} amt${totalAmount}`;
    
    let qrCode;
    if (sepay?.qrAccount && sepay?.qrBank) {
      const base = sepay.qrImgBase || "https://qr.sepay.vn/img";
      const acc = encodeURIComponent(bankAccount.accountNumber); // Use expert's account
      const bank = encodeURIComponent(bankAccount.bankCode);
      const tmpl = encodeURIComponent(sepay.qrTemplate || "compact");
      const encDes = encodeURIComponent(description).replace(/%20/g, "+");
      qrCode = `${base}?acc=${acc}&bank=${bank}&amount=${totalAmount}&des=${encDes}&template=${tmpl}`;
    }

    // Create payment batch
    const batch = await this.paymentBatchesRepository.createBatch({
      expertId,
      commissionIds,
      totalAmount,
      bankAccount: {
        accountHolderName: bankAccount.accountHolderName,
        accountNumber: bankAccount.accountNumber,
        bankCode: bankAccount.bankCode,
        bankName: bankAccount.bankName,
      },
      qrCode,
      status: "Pending",
      createdBy: adminId,
    });

    logger.info(
      { expertId, batchId: batch._id, totalAmount, commissionCount: commissionIds.length },
      "[PaymentBatch] Created payment batch"
    );

    return batch;
  }

  /**
   * Complete payment batch and mark commissions as paid
   */
  async completeBatch(batchId, adminId, paymentNote) {
    const batch = await this.paymentBatchesRepository.findById(batchId);
    if (!batch) {
      throw new Error("Không tìm thấy đợt thanh toán");
    }

    if (batch.status !== "Pending") {
      throw new Error("Đợt thanh toán này đã được xử lý");
    }

    // Mark batch as completed
    const updatedBatch = await this.paymentBatchesRepository.markAsCompleted(
      batchId,
      adminId,
      paymentNote
    );

    // Mark all commissions in this batch as Paid
    const now = new Date();
    await this.commissionRecordsRepository.updateMany(
      { _id: { $in: batch.commissionIds } },
      {
        status: "Paid",
        paidAt: now,
        paymentBatchId: batchId,
        paymentNote: paymentNote || undefined,
      }
    );

    logger.info(
      { batchId, expertId: batch.expertId, commissionCount: batch.commissionIds.length },
      "[PaymentBatch] Completed payment batch"
    );

    // Send notification to expert
    if (this.notificationService) {
      try {
        const formatCurrency = (amount) => {
          return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
        };
        
        await this.notificationService.emitCustomNotification(
          batch.expertId,
          "Thanh toán hoa hồng",
          `Bạn đã nhận được ${formatCurrency(batch.totalAmount)} từ ${batch.commissionIds.length} giao dịch hoa hồng`,
          "success",
          "PaymentBatch",
          batchId
        );
      } catch (e) {
        logger.warn({ error: e.message }, "[PaymentBatch] Failed to send notification");
      }
    }

    return updatedBatch;
  }

  /**
   * Get all payment batches with filters
   */
  async getAllBatches({ status, expertId, page, limit }) {
    return this.paymentBatchesRepository.findAllWithDetails({
      status,
      expertId,
      page,
      limit,
    });
  }

  /**
   * Get batch by ID
   */
  async getBatchById(id) {
    return this.paymentBatchesRepository.findById(id);
  }
}

module.exports = PaymentBatchService;
