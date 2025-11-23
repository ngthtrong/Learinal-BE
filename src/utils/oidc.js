const { createRemoteJWKSet, jwtVerify } = require("jose");

// Google OIDC discovery values
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const GOOGLE_JWKS_URI = new URL("https://www.googleapis.com/oauth2/v3/certs");
const JWKS = createRemoteJWKSet(GOOGLE_JWKS_URI);

/**
 * Verify a Google ID Token using Google's JWKS.
 * Validates signature, issuer, audience, and expiration. Returns the payload.
 * @param {string} idToken
 * @param {string} expectedAud - your OAuth client id
 */
async function verifyGoogleIdToken(idToken, expectedAud) {
  if (!idToken) throw new Error("Missing id_token");
  const { payload, protectedHeader } = await jwtVerify(idToken, JWKS, {
    algorithms: ["RS256"],
    audience: expectedAud,
  });
  const iss = payload.iss;
  if (!GOOGLE_ISSUERS.has(iss)) {
    const e = new Error("Invalid token issuer");
    e.code = "Unauthorized";
    e.status = 401;
    throw e;
  }
  return { payload, header: protectedHeader };
}

module.exports = { verifyGoogleIdToken };
