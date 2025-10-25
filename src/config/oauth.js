const env = require('./env');

module.exports = {
  provider: 'google',
  clientId: env.googleClientId,
  clientSecret: env.googleClientSecret,
  redirectUri: env.googleRedirectUri,
};
