class AuthService {
  constructor({ oauthClient } = {}) {
    this.oauthClient = oauthClient;
  }

  static base64url(input) {
    const json = typeof input === "string" ? input : JSON.stringify(input);
    return Buffer.from(json)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }

  makeStubJWT(payload = {}, { expiresInSec = 3600 } = {}) {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = { alg: "none", typ: "JWT" };
    const body = { iat: nowSec, exp: nowSec + expiresInSec, ...payload };
    const token = `${AuthService.base64url(header)}.${AuthService.base64url(
      body
    )}.stub`;
    return token;
  }

  makeStubRefreshToken(payload = {}) {
    const now = Date.now();
    const body = { t: now, ...payload };
    return `stub-refresh.${AuthService.base64url(body)}`;
  }

  async exchangeCode({ code, redirectUri, user } = {}) {
    // Stub: accept any code, generate fake tokens
    const sub = user?.userId || user?.id || "stub-user";
    const role = user?.role || "Learner";
    const email = user?.email || null;

    const accessToken = this.makeStubJWT({ sub, role, email });
    const refreshToken = this.makeStubRefreshToken({ sub });

    return { accessToken, refreshToken };
  }

  async refreshToken({ refreshToken, user } = {}) {
    // Stub: accept any refresh token, return new tokens
    const sub = user?.userId || user?.id || "stub-user";
    const role = user?.role || "Learner";
    const email = user?.email || null;

    const accessToken = this.makeStubJWT({ sub, role, email });
    const newRefresh = this.makeStubRefreshToken({ sub });

    return { accessToken, refreshToken: newRefresh };
  }
}

module.exports = AuthService;
