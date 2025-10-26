const axios = require('axios');

class OAuthClient {
  constructor(config) {
    this.config = config;
  }
  async exchangeCode(code) {
    const { googleClientId, googleClientSecret, googleRedirectUri } = this.config;
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const userInfoUrl = 'https://www.googleapis.com/oauth2/v3/userinfo';

    // Exchange auth code for tokens
    const tokenRes = await axios.post(tokenUrl, new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: googleRedirectUri,
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const tokens = tokenRes.data; // { access_token, refresh_token?, id_token, expires_in, scope, token_type }

    // Fetch user info
    const meRes = await axios.get(userInfoUrl, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const profile = meRes.data; // { sub, name, given_name, family_name, picture, email, email_verified, ... }
    return { tokens, profile };
  }
}

module.exports = OAuthClient;
