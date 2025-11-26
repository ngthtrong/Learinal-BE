/**
 * Unit tests for Commission Hybrid Model
 * Tests the commission configuration and calculation logic
 */

const commissionConfig = require('../../src/config/commission');

describe('Commission Configuration', () => {
  describe('Fixed Rates', () => {
    test('should return 300 VND for Published type', () => {
      expect(commissionConfig.getFixedCommission('Published')).toBe(300);
    });

    test('should return 150 VND for Validated type', () => {
      expect(commissionConfig.getFixedCommission('Validated')).toBe(150);
    });

    test('should return 0 for unknown type', () => {
      expect(commissionConfig.getFixedCommission('Unknown')).toBe(0);
    });
  });

  describe('Revenue Bonus Calculation', () => {
    test('should return 0 bonus when attempts <= threshold (100)', () => {
      expect(commissionConfig.calculateRevenueBonus('Published', 50)).toBe(0);
      expect(commissionConfig.calculateRevenueBonus('Published', 100)).toBe(0);
      expect(commissionConfig.calculateRevenueBonus('Validated', 100)).toBe(0);
    });

    test('should calculate 5% bonus for Published with excess attempts', () => {
      // 150 attempts, 50 excess, 50 * 500 VND = 25,000 VND excess revenue
      // 5% of 25,000 = 1,250 VND
      const bonus = commissionConfig.calculateRevenueBonus('Published', 150);
      expect(bonus).toBe(1250);
    });

    test('should calculate 2% bonus for Validated with excess attempts', () => {
      // 150 attempts, 50 excess, 50 * 500 VND = 25,000 VND excess revenue
      // 2% of 25,000 = 500 VND
      const bonus = commissionConfig.calculateRevenueBonus('Validated', 150);
      expect(bonus).toBe(500);
    });

    test('should calculate larger bonus for more excess attempts', () => {
      // 200 attempts, 100 excess, 100 * 500 VND = 50,000 VND excess revenue
      // 5% of 50,000 = 2,500 VND
      const bonus = commissionConfig.calculateRevenueBonus('Published', 200);
      expect(bonus).toBe(2500);
    });
  });

  describe('Entitlement Validation', () => {
    test('should return true for recently validated content', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30); // 30 days ago
      expect(commissionConfig.isEntitlementValid(recentDate)).toBe(true);
    });

    test('should return true for content validated 179 days ago', () => {
      const borderlineDate = new Date();
      borderlineDate.setDate(borderlineDate.getDate() - 179);
      expect(commissionConfig.isEntitlementValid(borderlineDate)).toBe(true);
    });

    test('should return false for content validated over 180 days ago', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 200);
      expect(commissionConfig.isEntitlementValid(oldDate)).toBe(false);
    });
  });

  describe('Configuration Values', () => {
    test('should have correct default values', () => {
      expect(commissionConfig.commissionPoolRate).toBe(0.30);
      expect(commissionConfig.entitlementDays).toBe(180);
      expect(commissionConfig.minimumCommissionAmount).toBe(10);
      expect(commissionConfig.revenueBonus.attemptThreshold).toBe(100);
    });

    test('should have correct status values', () => {
      expect(commissionConfig.statuses.PENDING).toBe('Pending');
      expect(commissionConfig.statuses.PAID).toBe('Paid');
      expect(commissionConfig.statuses.CANCELLED).toBe('Cancelled');
    });

    test('should have correct type values', () => {
      expect(commissionConfig.types.PUBLISHED).toBe('Published');
      expect(commissionConfig.types.VALIDATED).toBe('Validated');
    });
  });
});

describe('Commission Calculation Scenarios', () => {
  describe('Expert with Published Content', () => {
    test('calculates monthly earnings correctly', () => {
      // Expert has a popular quiz set with 250 attempts in a month
      const attemptsCount = 250;
      const fixedPerAttempt = commissionConfig.getFixedCommission('Published');
      const totalFixed = fixedPerAttempt * attemptsCount;
      const bonus = commissionConfig.calculateRevenueBonus('Published', attemptsCount);
      
      // Fixed: 250 * 300 = 75,000 VND
      expect(totalFixed).toBe(75000);
      
      // Bonus: (250-100) * 500 * 0.05 = 3,750 VND
      expect(bonus).toBe(3750);
      
      // Total: 78,750 VND
      expect(totalFixed + bonus).toBe(78750);
    });
  });

  describe('Expert with Validated Content', () => {
    test('calculates monthly earnings correctly', () => {
      // Expert validated a quiz set with 180 attempts in a month
      const attemptsCount = 180;
      const fixedPerAttempt = commissionConfig.getFixedCommission('Validated');
      const totalFixed = fixedPerAttempt * attemptsCount;
      const bonus = commissionConfig.calculateRevenueBonus('Validated', attemptsCount);
      
      // Fixed: 180 * 150 = 27,000 VND
      expect(totalFixed).toBe(27000);
      
      // Bonus: (180-100) * 500 * 0.02 = 800 VND
      expect(bonus).toBe(800);
      
      // Total: 27,800 VND
      expect(totalFixed + bonus).toBe(27800);
    });
  });

  describe('Comparison: Published vs Validated', () => {
    test('Published earns more than Validated for same attempts', () => {
      const attemptsCount = 200;
      
      const publishedFixed = commissionConfig.getFixedCommission('Published') * attemptsCount;
      const publishedBonus = commissionConfig.calculateRevenueBonus('Published', attemptsCount);
      const publishedTotal = publishedFixed + publishedBonus;
      
      const validatedFixed = commissionConfig.getFixedCommission('Validated') * attemptsCount;
      const validatedBonus = commissionConfig.calculateRevenueBonus('Validated', attemptsCount);
      const validatedTotal = validatedFixed + validatedBonus;
      
      // Published: 60,000 + 2,500 = 62,500 VND
      // Validated: 30,000 + 1,000 = 31,000 VND
      expect(publishedTotal).toBeGreaterThan(validatedTotal);
      expect(publishedTotal).toBe(62500);
      expect(validatedTotal).toBe(31000);
    });
  });
});
