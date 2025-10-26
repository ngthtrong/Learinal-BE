const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const { env, oauth } = require('../config');
const OAuthClient = require('../adapters/oauthClient');

function buildStubTokens(user) {
  const now = Date.now();
  return {
    accessToken: `stub.access.${Buffer.from(`${user.id}.${now}`).toString('base64url')}`,
    refreshToken: `stub.refresh.${Buffer.from(`${user.id}.${now + 1}`).toString('base64url')}`,
    tokenType: 'Bearer',
    expiresIn: 3600,
    user,
  };
}

module.exports = {
  // POST /auth/exchange
  exchange: async (req, res, next) => {
    try {
      const mode = process.env.AUTH_MODE || env.authMode || 'stub';
      if (mode === 'stub') {
        const devUserId = req.headers['x-dev-user-id'] || randomUUID();
        const devUserRole = req.headers['x-dev-user-role'] || 'Learner';
        const email = `${devUserId}@example.test`;
        const user = {
          id: devUserId,
          fullName: 'Stub User',
          email,
          role: devUserRole,
          status: 'Active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const body = buildStubTokens(user);
        return res.status(200).json(body);
      }

      // Real mode: Exchange Google code for tokens and issue our JWTs
      const { code } = req.body || {};
      if (!code) {
        return res.status(400).json({ code: 'ValidationError', message: 'Missing code in body' });
      }
      const client = new OAuthClient(env);
      const { profile } = await client.exchangeCode(code);
      const sub = profile.sub || profile.id || randomUUID();
      const payload = {
        sub,
        email: profile.email,
        name: profile.name || profile.email,
        role: 'Learner',
        status: 'Active',
      };
      const accessToken = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
      const refreshToken = jwt.sign({ sub, type: 'refresh' }, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpiresIn });
      return res.status(200).json({
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: { id: sub, fullName: payload.name, email: payload.email, role: payload.role, status: payload.status },
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /auth/refresh
  refresh: async (req, res, next) => {
    try {
      const mode = process.env.AUTH_MODE || env.authMode || 'stub';
      if (mode === 'stub') {
        const devUserId = req.headers['x-dev-user-id'] || randomUUID();
        const devUserRole = req.headers['x-dev-user-role'] || 'Learner';
        const email = `${devUserId}@example.test`;
        const user = {
          id: devUserId,
          fullName: 'Stub User',
          email,
          role: devUserRole,
          status: 'Active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const body = buildStubTokens(user);
        return res.status(200).json(body);
      }

      const { refreshToken } = req.body || {};
      if (!refreshToken) {
        return res.status(400).json({ code: 'ValidationError', message: 'Missing refreshToken' });
      }
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, env.jwtRefreshSecret);
      } catch (e) {
        return res.status(401).json({ code: 'Unauthorized', message: 'Invalid refresh token' });
      }
      const sub = decoded.sub;
      const payload = { sub, role: 'Learner' };
      const accessToken = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
      return res.status(200).json({ accessToken, tokenType: 'Bearer', expiresIn: 3600 });
    } catch (err) {
      next(err);
    }
  },
};
