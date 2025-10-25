const express = require("express");
const controller = require("../controllers/users.controller");
const authenticateJWT = require("../middleware/authenticateJWT");
const authorizeRole = require("../middleware/authorizeRole");

const router = express.Router();

// Current user endpoints
router.get(
  "/me",
  authenticateJWT,
  authorizeRole("Learner", "Expert", "Admin"),
  controller.me
);
router.patch(
  "/me",
  authenticateJWT,
  authorizeRole("Learner", "Expert", "Admin"),
  controller.updateMe
);

module.exports = router;
