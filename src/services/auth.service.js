class AuthService {
  constructor({ oauthClient }) {
    this.oauthClient = oauthClient;
  }
  async exchangeCode(/* code */) { throw new Error('NotImplemented'); }
  async refreshToken(/* token */) { throw new Error('NotImplemented'); }
}

module.exports = AuthService;
