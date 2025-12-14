const { VIETNAMESE_BANKS } = require("../constants/vietnameseBanks");

module.exports = {
  /**
   * Get list of Vietnamese banks
   * GET /banks
   */
  getBanks: async (req, res, next) => {
    try {
      return res.status(200).json({
        code: "Success",
        data: VIETNAMESE_BANKS,
      });
    } catch (error) {
      next(error);
    }
  },
};
