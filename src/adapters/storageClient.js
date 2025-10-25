class StorageClient {
  constructor(config) {
    this.config = config;
  }
  async upload(/* file */) { throw new Error('NotImplemented'); }
  async getUrl(/* path */) { throw new Error('NotImplemented'); }
}

module.exports = StorageClient;
