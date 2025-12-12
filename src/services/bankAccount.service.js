class BankAccountService {
  constructor({ bankAccountsRepository, usersRepository }) {
    this.bankAccountsRepository = bankAccountsRepository;
    this.usersRepository = usersRepository;
  }

  /**
   * Link or update expert's bank account
   */
  async linkBankAccount(expertId, { accountHolderName, accountNumber, bankCode, bankName }) {
    // Validate input
    if (!accountHolderName || !accountNumber || !bankCode || !bankName) {
      throw new Error("Vui lòng điền đầy đủ thông tin tài khoản ngân hàng");
    }

    // Check if expert already has a bank account
    const existing = await this.bankAccountsRepository.findByExpertId(expertId);
    
    if (existing) {
      // Update existing account and reset status to Pending
      const updated = await this.bankAccountsRepository.updateById(existing._id || existing.id, {
        accountHolderName,
        accountNumber,
        bankCode,
        bankName,
        status: "Pending", // Reset to pending for re-verification
        verifiedBy: null,
        verifiedAt: null,
        rejectionReason: null,
      });
      return updated;
    }

    // Create new bank account
    const bankAccount = await this.bankAccountsRepository.create({
      expertId,
      accountHolderName,
      accountNumber,
      bankCode,
      bankName,
      status: "Pending",
    });

    return bankAccount;
  }

  /**
   * Get expert's current bank account
   */
  async getMyBankAccount(expertId) {
    return this.bankAccountsRepository.findByExpertId(expertId);
  }

  /**
   * Get all bank accounts (Admin only)
   */
  async getAllBankAccounts({ status, page, limit }) {
    return this.bankAccountsRepository.findAllWithExperts({ status, page, limit });
  }

  /**
   * Verify bank account (Admin only)
   */
  async verifyBankAccount(id, adminId) {
    const account = await this.bankAccountsRepository.findById(id);
    if (!account) {
      throw new Error("Không tìm thấy tài khoản ngân hàng");
    }

    if (account.status === "Verified") {
      throw new Error("Tài khoản này đã được xác minh");
    }

    return this.bankAccountsRepository.verify(id, adminId);
  }

  /**
   * Reject bank account (Admin only)
   */
  async rejectBankAccount(id, adminId, reason) {
    const account = await this.bankAccountsRepository.findById(id);
    if (!account) {
      throw new Error("Không tìm thấy tài khoản ngân hàng");
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error("Vui lòng nhập lý do từ chối");
    }

    return this.bankAccountsRepository.reject(id, adminId, reason);
  }
}

module.exports = BankAccountService;
