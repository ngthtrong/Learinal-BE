const express = require("express");
const controller = require("../controllers/auth.controller");

const router = express.Router();

router.post("/exchange", controller.exchange);
router.post("/refresh", controller.refresh);

module.exports = router;
