const express = require("express");
const router = express.Router();
const bankAccountsController = require("../controllers/bankAccounts.controller");
const authenticateJWT = require("../middleware/authenticateJWT");
const authorizeRole = require("../middleware/authorizeRole");

// Expert routes - manage own bank account
router.post(
  "/",
  authenticateJWT,
  authorizeRole("Expert"),
  bankAccountsController.linkBankAccount
);

router.get(
  "/",
  authenticateJWT,
  authorizeRole("Expert"),
  bankAccountsController.getMyBankAccount
);

module.exports = router;
