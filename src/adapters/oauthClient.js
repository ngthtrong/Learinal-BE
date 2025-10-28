const axios = require('axios');
const logger = require('../utils/logger');

class OAuthClient {
  constructor(config) {
    this.config = config;
    this.tokenUrl = 'https://oauth2.googleapis.com/token';
    this.userInfoUrl = 'https://www.googleapis.com/oauth2/v3/userinfo';
    this.tokenInfoUrl = 'https://oauth2.googleapis.com/tokeninfo';
  }

  /**
   * Exchange authorization code for Google tokens and user profile
   * @param {string} code - Authorization code from Google OAuth
   * @param {string} redirectUri - Redirect URI (must match what was registered)
   * @returns {Object} { tokens, profile }
   */
  async exchangeCode(code, redirectUri) {
    const { clientId, clientSecret } = this.config;
    
    if (!clientId || !clientSecret) {
      throw new Error('OAuth client credentials not configured');
    }

    const actualRedirectUri = redirectUri || this.config.redirectUri;
    
    if (!actualRedirectUri) {
      throw new Error('OAuth redirect URI not provided');
    }

    try {
      // Exchange auth code for tokens
      logger.info({ redirectUri: actualRedirectUri }, 'Exchanging OAuth code for tokens');
      
      const tokenResponse = await axios.post(
        this.tokenUrl,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: actualRedirectUri,
        }),
        {
          headers: { 
            'Content-Type': 'application/x-www-form-urlencoded' 
          },
          timeout: 10000,
        }
      );

      const tokens = tokenResponse.data;
      // tokens: { access_token, refresh_token?, id_token, expires_in, scope, token_type }
      
      logger.info({ 
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        hasIdToken: !!tokens.id_token,
        expiresIn: tokens.expires_in,
      }, 'OAuth tokens received');

      // Fetch user profile using access token
      const profileResponse = await axios.get(this.userInfoUrl, {
        headers: { 
          Authorization: `Bearer ${tokens.access_token}` 
        },
        timeout: 10000,
      });

      const profile = profileResponse.data;
      // profile: { sub, name, given_name, family_name, picture, email, email_verified, locale }
      
      logger.info({ 
        sub: profile.sub,
        email: profile.email,
        emailVerified: profile.email_verified,
      }, 'User profile fetched');

      // Validate email is verified
      if (!profile.email_verified) {
        logger.warn({ email: profile.email }, 'Email not verified');
        // Still proceed but could add stricter validation
      }

      return { tokens, profile };

    } catch (error) {
      if (error.response) {
        // OAuth error response
        logger.error({
          status: error.response.status,
          data: error.response.data,
        }, 'OAuth exchange failed');
        
        const errorData = error.response.data;
        throw new Error(
          `OAuth exchange failed: ${errorData.error_description || errorData.error || 'Unknown error'}`
        );
      } else if (error.request) {
        // No response received
        logger.error({ error: error.message }, 'OAuth request timeout or network error');
        throw new Error('OAuth service unavailable');
      } else {
        // Other errors
        logger.error({ error }, 'OAuth exchange error');
        throw error;
      }
    }
  }

  /**
   * Verify Google ID token (optional, for additional security)
   * @param {string} idToken 
   * @returns {Object} Token info
   */
  async verifyIdToken(idToken) {
    try {
      const response = await axios.get(this.tokenInfoUrl, {
        params: { id_token: idToken },
        timeout: 5000,
      });

      const tokenInfo = response.data;
      // tokenInfo: { azp, aud, sub, scope, exp, expires_in, email, email_verified, ... }
      
      // Verify audience matches our client ID
      if (tokenInfo.aud !== this.config.clientId) {
        throw new Error('ID token audience mismatch');
      }

      // Check expiration
      if (tokenInfo.exp && parseInt(tokenInfo.exp) < Math.floor(Date.now() / 1000)) {
        throw new Error('ID token expired');
      }

      return tokenInfo;

    } catch (error) {
      logger.error({ error }, 'ID token verification failed');
      throw error;
    }
  }

  /**
   * Refresh Google access token (if refresh token available)
   * @param {string} refreshToken 
   * @returns {Object} New tokens
   */
  async refreshGoogleToken(refreshToken) {
    const { clientId, clientSecret } = this.config;

    try {
      const response = await axios.post(
        this.tokenUrl,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
        {
          headers: { 
            'Content-Type': 'application/x-www-form-urlencoded' 
          },
          timeout: 10000,
        }
      );

      const tokens = response.data;
      logger.info({ expiresIn: tokens.expires_in }, 'Google token refreshed');

      return tokens;

    } catch (error) {
      logger.error({ error }, 'Google token refresh failed');
      throw new Error('Failed to refresh Google token');
    }
  }

  /**
   * Revoke Google token
   * @param {string} token - Access or refresh token
   */
  async revokeToken(token) {
    try {
      await axios.post(
        'https://oauth2.googleapis.com/revoke',
        new URLSearchParams({ token }),
        {
          headers: { 
            'Content-Type': 'application/x-www-form-urlencoded' 
          },
          timeout: 5000,
        }
      );

      logger.info('Google token revoked');

    } catch (error) {
      logger.error({ error }, 'Google token revocation failed');
      // Don't throw - revocation is best effort
    }
  }
}

module.exports = OAuthClient;
