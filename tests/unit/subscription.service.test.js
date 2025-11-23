const SubscriptionService = require("../../src/services/subscription.service");
const SubscriptionPlansRepository = require("../../src/repositories/subscriptionPlans.repository");
const UserSubscriptionsRepository = require("../../src/repositories/userSubscriptions.repository");
const UsersRepository = require("../../src/repositories/users.repository");
const { connectTestDB, closeTestDB, clearTestDB } = require("../helpers/db");
const {
  createTestUser,
  createTestSubscriptionPlan,
  createTestUserSubscription,
} = require("../helpers/factories");

describe("SubscriptionService", () => {
  let subscriptionService;
  let plansRepo;
  let subsRepo;
  let usersRepo;

  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    plansRepo = new SubscriptionPlansRepository();
    subsRepo = new UserSubscriptionsRepository();
    usersRepo = new UsersRepository();
    subscriptionService = new SubscriptionService(plansRepo, subsRepo, usersRepo);
  });

  describe("listActivePlans", () => {
    it("should return only active subscription plans", async () => {
      await createTestSubscriptionPlan({
        planName: "Active Plan 1",
        isActive: true,
      });
      await createTestSubscriptionPlan({
        planName: "Active Plan 2",
        isActive: true,
      });
      await createTestSubscriptionPlan({
        planName: "Inactive Plan",
        isActive: false,
      });

      const plans = await subscriptionService.listActivePlans();

      expect(plans).toHaveLength(2);
      expect(plans.every((p) => p.isActive === true)).toBe(true);
    });

    it("should return empty array if no active plans", async () => {
      const plans = await subscriptionService.listActivePlans();
      expect(plans).toEqual([]);
    });
  });

  describe("getUserActiveSubscription", () => {
    it("should return active subscription for user", async () => {
      const user = await createTestUser();
      const plan = await createTestSubscriptionPlan();
      const subscription = await createTestUserSubscription(
        user._id,
        plan._id,
        { status: "Active" }
      );

      const result = await subscriptionService.getUserActiveSubscription(
        user._id.toString()
      );

      expect(result).toBeTruthy();
      expect(result.id).toBe(subscription._id.toString());
      expect(result.status).toBe("Active");
    });

    it("should return null if user has no active subscription", async () => {
      const user = await createTestUser();
      const plan = await createTestSubscriptionPlan();
      await createTestUserSubscription(user._id, plan._id, {
        status: "Expired",
      });

      const result = await subscriptionService.getUserActiveSubscription(
        user._id.toString()
      );

      expect(result).toBeNull();
    });

    it("should return null if user has no subscription at all", async () => {
      const user = await createTestUser();

      const result = await subscriptionService.getUserActiveSubscription(
        user._id.toString()
      );

      expect(result).toBeNull();
    });
  });

  describe("createSubscription", () => {
    it("should create new subscription for user", async () => {
      const user = await createTestUser();
      const plan = await createTestSubscriptionPlan({
        price: 199000,
        billingCycle: "Monthly",
      });

      const subscription = await subscriptionService.createSubscription(
        user._id.toString(),
        plan._id.toString()
      );

      expect(subscription).toBeTruthy();
      expect(subscription.userId.toString()).toBe(user._id.toString());
      expect(subscription.subscriptionPlanId.toString()).toBe(
        plan._id.toString()
      );
      expect(subscription.status).toBe("Active");
      expect(subscription.entitlementsSnapshot).toMatchObject(plan.entitlements);
    });

    it("should expire old subscription when creating new one", async () => {
      const user = await createTestUser();
      const oldPlan = await createTestSubscriptionPlan({
        planName: "Old Plan",
      });
      const newPlan = await createTestSubscriptionPlan({
        planName: "New Plan",
      });

      const oldSub = await createTestUserSubscription(user._id, oldPlan._id, {
        status: "Active",
      });

      const newSub = await subscriptionService.createSubscription(
        user._id.toString(),
        newPlan._id.toString()
      );

      // Check old subscription is expired
      const oldSubAfter = await subsRepo.findById(oldSub._id.toString());
      expect(oldSubAfter.status).toBe("Expired");

      // Check new subscription is active
      expect(newSub.status).toBe("Active");
    });

    it("should throw error if plan not found", async () => {
      const user = await createTestUser();
      const nonExistentPlanId = "507f1f77bcf86cd799439099";

      await expect(
        subscriptionService.createSubscription(
          user._id.toString(),
          nonExistentPlanId
        )
      ).rejects.toThrow();
    });

    it("should throw error if plan is inactive", async () => {
      const user = await createTestUser();
      const plan = await createTestSubscriptionPlan({ isActive: false });

      await expect(
        subscriptionService.createSubscription(
          user._id.toString(),
          plan._id.toString()
        )
      ).rejects.toThrow("not active");
    });

    it("should set correct renewal date based on billing cycle", async () => {
      const user = await createTestUser();
      const monthlyPlan = await createTestSubscriptionPlan({
        billingCycle: "Monthly",
      });

      const subscription = await subscriptionService.createSubscription(
        user._id.toString(),
        monthlyPlan._id.toString()
      );

      const renewalDate = new Date(subscription.renewalDate);
      const startDate = new Date(subscription.startDate);
      const expectedRenewal = new Date(startDate);
      expectedRenewal.setMonth(expectedRenewal.getMonth() + 1);

      expect(renewalDate.getMonth()).toBe(expectedRenewal.getMonth());
    });
  });

  describe("checkEntitlement", () => {
    it("should return true if user has entitlement", async () => {
      const user = await createTestUser();
      const plan = await createTestSubscriptionPlan({
        entitlements: {
          canShareQuestionSets: true,
          canExportQuestionSets: true,
        },
      });
      await createTestUserSubscription(user._id, plan._id, {
        status: "Active",
        entitlementsSnapshot: plan.entitlements,
      });

      const canShare = await subscriptionService.checkEntitlement(
        user._id.toString(),
        "canShareQuestionSets"
      );
      const canExport = await subscriptionService.checkEntitlement(
        user._id.toString(),
        "canExportQuestionSets"
      );

      expect(canShare).toBe(true);
      expect(canExport).toBe(true);
    });

    it("should return false if user has no active subscription", async () => {
      const user = await createTestUser();

      const canShare = await subscriptionService.checkEntitlement(
        user._id.toString(),
        "canShareQuestionSets"
      );

      expect(canShare).toBe(false);
    });

    it("should return false if entitlement is not granted", async () => {
      const user = await createTestUser();
      const plan = await createTestSubscriptionPlan({
        entitlements: {
          canShareQuestionSets: false,
        },
      });
      await createTestUserSubscription(user._id, plan._id, {
        status: "Active",
        entitlementsSnapshot: plan.entitlements,
      });

      const canShare = await subscriptionService.checkEntitlement(
        user._id.toString(),
        "canShareQuestionSets"
      );

      expect(canShare).toBe(false);
    });
  });
});
