const express = require("express");

const router = express.Router();

// Mount resource routers here under /api/v1
router.use("/auth", require("./auth.routes"));
router.use("/users", require("./users.routes"));
router.use("/subjects", require("./subjects.routes"));
router.use("/documents", require("./documents.routes"));
router.use("/question-sets", require("./questionSets.routes"));
router.use("/quiz-attempts", require("./quizAttempts.routes"));
router.use("/validation-requests", require("./validationRequests.routes"));
router.use("/commission-records", require("./commissionRecords.routes"));
router.use("/subscription-plans", require("./subscriptionPlans.routes"));
router.use("/user-subscriptions", require("./userSubscriptions.routes"));
router.use("/notifications", require("./notifications.routes"));
router.use("/admin", require("./admin.routes"));
router.use("/moderation", require("./moderation.routes"));
router.use("/search", require("./search.routes"));
router.use("/batch", require("./batch.routes"));
router.use("/export", require("./export.routes"));
router.use("/import", require("./import.routes"));
router.use("/webhooks", require("./webhooks.routes"));
router.use("/payments", require("./payments.routes"));

module.exports = router;
