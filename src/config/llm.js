module.exports = {
  provider: 'gemini',
  // Prefer stable v1 models; override with GEMINI_MODEL if needed (e.g., gemini-1.5-pro)
  model: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
  apiKey: process.env.GEMINI_API_KEY || '',
  timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '30000', 10),
  retries: parseInt(process.env.LLM_RETRIES || '10', 10),
};
