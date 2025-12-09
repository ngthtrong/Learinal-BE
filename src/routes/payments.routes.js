const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const paymentsController = require("../controllers/payments.controller");

const router = express.Router();

// Generate a dynamic Sepay QR for the current user
router.post("/sepay/qr", authenticateJWT, paymentsController.createSepayQr);

// List transactions from Sepay user API (debug/ops)
router.get("/sepay/transactions", paymentsController.listSepayTransactions);
router.post("/sepay/transactions", paymentsController.listSepayTransactions);

// Scan transactions (consider protecting with Admin role in production)
router.post("/sepay/scan", paymentsController.scanSepayTransactions);

// Scan addon transactions
router.post("/sepay/scan-addons", paymentsController.scanSepayAddonTransactions);

module.exports = router;
