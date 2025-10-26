const healthService = require("../services/health.service");

const getHealth = async (req, res, next) => {
  try {
    const payload = await healthService.getHealthStatus();
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
};

module.exports = { getHealth };
