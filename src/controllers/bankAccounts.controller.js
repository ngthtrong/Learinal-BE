const logger = require("../utils/logger");

module.exports = {
  /**
   * Link or update bank account (Expert only)
   * POST /expert/bank-account
   */
  linkBankAccount: async (req, res, next) => {
    try {
      const { bankAccountService } = req.app.locals;
      const expertId = req.user?.id;
      const { accountHolderName, accountNumber, bankCode, bankName } = req.body;

      if (!expertId) {
        return res.status(401).json({ code: "Unauthorized", message: "Missing user" });
      }

      const bankAccount = await bankAccountService.linkBankAccount(expertId, {
        accountHolderName,
        accountNumber,
        bankCode,
        bankName,
      });

      logger.info(
        { expertId, bankAccountId: bankAccount._id || bankAccount.id },
        "[BankAccount] Expert linked bank account"
      );

      return res.status(200).json({
        code: "Success",
        message: "Liên kết tài khoản ngân hàng thành công",
        data: bankAccount,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get my bank account (Expert only)
   * GET /expert/bank-account
   */
  getMyBankAccount: async (req, res, next) => {
    try {
      const { bankAccountService } = req.app.locals;
      const expertId = req.user?.id;

      if (!expertId) {
        return res.status(401).json({ code: "Unauthorized", message: "Missing user" });
      }

      const bankAccount = await bankAccountService.getMyBankAccount(expertId);

      return res.status(200).json({
        code: "Success",
        data: bankAccount,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get all bank accounts (Admin only)
   * GET /admin/bank-accounts
   */
  getAllBankAccounts: async (req, res, next) => {
    try {
      const { bankAccountService } = req.app.locals;
      const { status, page = 1, limit = 20 } = req.query;

      const result = await bankAccountService.getAllBankAccounts({
        status,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return res.status(200).json({
        code: "Success",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Verify bank account (Admin only)
   * PUT /admin/bank-accounts/:id/verify
   */
  verifyBankAccount: async (req, res, next) => {
    try {
      const { bankAccountService } = req.app.locals;
      const adminId = req.user?.id;
      const { id } = req.params;

      if (!adminId) {
        return res.status(401).json({ code: "Unauthorized", message: "Missing user" });
      }

      const bankAccount = await bankAccountService.verifyBankAccount(id, adminId);

      logger.info(
        { adminId, bankAccountId: id, expertId: bankAccount.expertId },
        "[BankAccount] Admin verified bank account"
      );

      return res.status(200).json({
        code: "Success",
        message: "Xác minh tài khoản ngân hàng thành công",
        data: bankAccount,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Reject bank account (Admin only)
   * PUT /admin/bank-accounts/:id/reject
   */
  rejectBankAccount: async (req, res, next) => {
    try {
      const { bankAccountService } = req.app.locals;
      const adminId = req.user?.id;
      const { id } = req.params;
      const { reason } = req.body;

      if (!adminId) {
        return res.status(401).json({ code: "Unauthorized", message: "Missing user" });
      }

      const bankAccount = await bankAccountService.rejectBankAccount(id, adminId, reason);

      logger.info(
        { adminId, bankAccountId: id, expertId: bankAccount.expertId, reason },
        "[BankAccount] Admin rejected bank account"
      );

      return res.status(200).json({
        code: "Success",
        message: "Từ chối tài khoản ngân hàng thành công",
        data: bankAccount,
      });
    } catch (error) {
      next(error);
    }
  },
};
