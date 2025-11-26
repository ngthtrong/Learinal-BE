/**
 * Commission Configuration for Expert Payments
 * Hybrid Model: Fixed Rate + Revenue Bonus
 * 
 * Based on SRS 4.1.2 with enhancements
 */

module.exports = {
  // Percentage of total revenue allocated to commission pool
  commissionPoolRate: 0.30, // 30%

  // Fixed rates per quiz attempt (VND)
  fixedRates: {
    published: 300,  // Expert created and published content
    validated: 150,  // Expert validated learner's content
  },

  // Revenue bonus configuration (for high-performing content)
  revenueBonus: {
    // Threshold: attempts per month before bonus kicks in
    attemptThreshold: 100,
    
    // Bonus rates (percentage of revenue from excess attempts)
    rates: {
      published: 0.05, // 5% of excess attempts revenue
      validated: 0.02, // 2% of excess attempts revenue
    },
  },

  // Average revenue per premium attempt (for bonus calculation)
  // This should be calculated from actual subscription price / expected attempts
  // Example: 99,000 VND/month subscription with ~200 attempts = ~500 VND/attempt
  averageRevenuePerAttempt: 500, // VND

  // Entitlement period: how long Expert earns commission after validation
  entitlementDays: 180, // 6 months

  // Minimum commission amount to create a record (avoid micro-transactions)
  minimumCommissionAmount: 10, // VND

  // Commission record statuses
  statuses: {
    PENDING: 'Pending',
    PAID: 'Paid',
    CANCELLED: 'Cancelled',
  },

  // Commission types
  types: {
    PUBLISHED: 'Published',   // Expert created the question set
    VALIDATED: 'Validated',   // Expert validated the question set
  },

  // Batch reconciliation settings
  reconciliation: {
    // Day of month to run reconciliation (1-28 recommended)
    dayOfMonth: 1,
    
    // Grace period before finalizing commissions (days)
    gracePeriodDays: 3,
  },

  /**
   * Calculate fixed commission for an attempt
   * @param {string} type - 'Published' or 'Validated'
   * @returns {number} Fixed commission amount in VND
   */
  getFixedCommission(type) {
    if (type === this.types.PUBLISHED) {
      return this.fixedRates.published;
    }
    if (type === this.types.VALIDATED) {
      return this.fixedRates.validated;
    }
    return 0;
  },

  /**
   * Calculate revenue bonus for a set in a month
   * @param {string} type - 'Published' or 'Validated'
   * @param {number} totalAttempts - Total attempts on this set this month
   * @returns {number} Bonus amount in VND
   */
  calculateRevenueBonus(type, totalAttempts) {
    if (totalAttempts <= this.revenueBonus.attemptThreshold) {
      return 0;
    }

    const excessAttempts = totalAttempts - this.revenueBonus.attemptThreshold;
    const excessRevenue = excessAttempts * this.averageRevenuePerAttempt;
    
    let bonusRate = 0;
    if (type === this.types.PUBLISHED) {
      bonusRate = this.revenueBonus.rates.published;
    } else if (type === this.types.VALIDATED) {
      bonusRate = this.revenueBonus.rates.validated;
    }

    return Math.round(excessRevenue * bonusRate);
  },

  /**
   * Check if an entitlement is still valid
   * @param {Date} validatedAt - When the content was validated
   * @returns {boolean} Whether commission should still be paid
   */
  isEntitlementValid(validatedAt) {
    const now = new Date();
    const validatedDate = new Date(validatedAt);
    const daysSinceValidation = Math.floor(
      (now - validatedDate) / (1000 * 60 * 60 * 24)
    );
    return daysSinceValidation <= this.entitlementDays;
  },
};
