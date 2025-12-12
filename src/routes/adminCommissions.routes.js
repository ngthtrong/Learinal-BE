const express = require("express");
const router = express.Router();
const bankAccountsController = require("../controllers/bankAccounts.controller");
const paymentBatchesController = require("../controllers/paymentBatches.controller");
const authenticateJWT = require("../middleware/authenticateJWT");
const authorizeRole = require("../middleware/authorizeRole");

// Bank account management routes (Admin only)
router.get(
  "/bank-accounts",
  authenticateJWT,
  authorizeRole("Admin"),
  bankAccountsController.getAllBankAccounts
);

router.put(
  "/bank-accounts/:id/verify",
  authenticateJWT,
  authorizeRole("Admin"),
  bankAccountsController.verifyBankAccount
);

router.put(
  "/bank-accounts/:id/reject",
  authenticateJWT,
  authorizeRole("Admin"),
  bankAccountsController.rejectBankAccount
);

// Payment batch routes (Admin only)
router.post(
  "/payment-batches",
  authenticateJWT,
  authorizeRole("Admin"),
  paymentBatchesController.createBatch
);

router.get(
  "/payment-batches",
  authenticateJWT,
  authorizeRole("Admin"),
  paymentBatchesController.getAllBatches
);

router.get(
  "/payment-batches/:id",
  authenticateJWT,
  authorizeRole("Admin"),
  paymentBatchesController.getBatchById
);

router.put(
  "/payment-batches/:id/complete",
  authenticateJWT,
  authorizeRole("Admin"),
  paymentBatchesController.completeBatch
);

module.exports = router;
