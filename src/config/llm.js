module.exports = {
  provider: 'gemini',
  apiKey: process.env.GEMINI_API_KEY || '',
  timeoutMs: 30_000,
  retries: 2,
};
