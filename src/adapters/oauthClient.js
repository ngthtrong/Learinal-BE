const axios = require("axios");

class OAuthClient {
  constructor(config) {
    this.config = config;
  }
  async exchangeCode(code, { codeVerifier } = {}) {
    const { googleClientId, googleClientSecret, googleRedirectUri } = this.config;
    const tokenUrl = "https://oauth2.googleapis.com/token";
    const userInfoUrl = "https://www.googleapis.com/oauth2/v3/userinfo";

    // Exchange auth code for tokens
    let tokenRes;
    try {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: googleRedirectUri,
      });
      if (codeVerifier) body.set("code_verifier", codeVerifier);
      tokenRes = await axios.post(tokenUrl, body, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 5000,
      });
    } catch (e) {
      const status = e?.response?.status;
      const data = e?.response?.data;
      const err = new Error("OAuth token exchange failed");
      err.status = status === 400 ? 401 : 502;
      err.code = status === 400 ? "Unauthorized" : "UpstreamError";
      err.details = data || { message: e.message };
      throw err;
    }

    const tokens = tokenRes.data; // { access_token, refresh_token?, id_token, expires_in, scope, token_type }

    // Fetch user info
    let meRes;
    try {
      meRes = await axios.get(userInfoUrl, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        timeout: 5000,
      });
    } catch (e) {
      const status = e?.response?.status;
      const data = e?.response?.data;
      const err = new Error("OAuth userinfo fetch failed");
      err.status = status === 401 ? 401 : 502;
      err.code = status === 401 ? "Unauthorized" : "UpstreamError";
      err.details = data || { message: e.message };
      throw err;
    }

    const profile = meRes.data; // { sub, name, given_name, family_name, picture, email, email_verified, ... }
    return { tokens, profile };
  }
}

module.exports = OAuthClient;
