const express = require("express");
const router = express.Router();
const banksController = require("../controllers/banks.controller");

// Public route - get list of Vietnamese banks
router.get("/", banksController.getBanks);

module.exports = router;
