/**
 * Addon Scan Job
 * Periodically scan Sepay transactions and activate addon packages
 * Scheduled: Every 1 minute
 */
const SepayScanService = require("../services/sepayScan.service");
const logger = require("../utils/logger");

async function execute() {
  try {
    const service = new SepayScanService();
    const result = await service.scanRecentAddons({ limit: 50 });
    
    if (result.activated > 0) {
      logger.info(
        { 
          total: result.total, 
          matched: result.matched, 
          activated: result.activated 
        },
        "[addon.scan] Activated addon packages"
      );
    }
    
    return result;
  } catch (err) {
    logger.error({ err }, "[addon.scan] Failed to scan addon transactions");
    throw err;
  }
}

module.exports = { execute };
