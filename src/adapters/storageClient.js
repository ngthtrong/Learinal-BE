const fs = require('fs');
const path = require('path');

class StorageClient {
  constructor(config) {
    this.config = config;
  }

  async upload(file) {
    const mode = process.env.STORAGE_MODE || 'local';
    if (mode === 'local') {
      const dir = path.resolve(process.cwd(), 'uploads');
      await fs.promises.mkdir(dir, { recursive: true });
      const filename = `${Date.now()}_${file.originalname}`;
      const dest = path.join(dir, filename);
      await fs.promises.writeFile(dest, file.buffer);
      return { storagePath: dest };
    }
    throw new Error('Storage provider not implemented');
  }

  async getUrl(storagePath) {
    const mode = process.env.STORAGE_MODE || 'local';
    if (mode === 'local') {
      return `file://${storagePath}`;
    }
    throw new Error('Storage provider not implemented');
  }
}

module.exports = StorageClient;
