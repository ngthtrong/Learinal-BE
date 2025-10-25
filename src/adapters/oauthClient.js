class OAuthClient {
  constructor(config) {
    this.config = config;
  }
  async exchangeCode(/* code */) {
    // TODO: Exchange Google OAuth code -> tokens
    throw new Error('NotImplemented');
  }
}

module.exports = OAuthClient;
