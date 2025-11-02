const fs = require("fs");
const path = require("path");
const os = require("os");
const logger = require("../utils/logger");

/**
 * Cleanup temp files older than 1 hour
 * Fallback for crashed/failed jobs that didn't cleanup
 */
module.exports = async function cleanupTempFiles() {
  const tempDir = path.join(os.tmpdir(), "learinal-uploads");

  // Check if directory exists
  try {
    await fs.promises.access(tempDir);
  } catch (_err) {
    // Directory doesn't exist, nothing to cleanup
    return;
  }

  try {
    const files = await fs.promises.readdir(tempDir);
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    let cleanedCount = 0;
    let errorCount = 0;

    for (const filename of files) {
      const filePath = path.join(tempDir, filename);

      try {
        const stats = await fs.promises.stat(filePath);
        const fileAge = now - stats.mtimeMs;

        // Delete files older than 1 hour
        if (fileAge > ONE_HOUR) {
          await fs.promises.unlink(filePath);
          cleanedCount++;
          logger.info(
            { filePath, ageHours: (fileAge / ONE_HOUR).toFixed(2) },
            "[cleanup.tempfiles] deleted stale file"
          );
        }
      } catch (err) {
        errorCount++;
        logger.warn({ filePath, err: err.message }, "[cleanup.tempfiles] failed to process file");
      }
    }

    if (cleanedCount > 0 || errorCount > 0) {
      logger.info(
        { cleanedCount, errorCount, totalFiles: files.length },
        "[cleanup.tempfiles] completed"
      );
    }
  } catch (err) {
    logger.error({ err: err.message }, "[cleanup.tempfiles] failed to read temp directory");
  }
};
