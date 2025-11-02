const logger = require("../utils/logger");
const axios = require("axios");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class LLMClient {
  constructor(config) {
    this.config = config; // { model, apiKey, timeoutMs, retries }
  }

  get endpoint() {
    const model = this.config.model || "gemini-1.5-flash";
    const base = "https://generativelanguage.googleapis.com/v1";
    const path = model.startsWith("models/")
      ? `${model}:generateContent`
      : `models/${model}:generateContent`;
    return `${base}/${path}`;
  }

  async callGeminiJSON(prompt) {
    const { apiKey, timeoutMs = 30000, retries = 2 } = this.config;
    const url = `${this.endpoint}?key=${encodeURIComponent(apiKey)}`;
    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // Keep minimal generationConfig; enforce JSON via prompt for broad API compatibility
      generationConfig: { temperature: 0.2 },
    };
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const res = await axios.post(url, body, { timeout: timeoutMs });
        const cand = res?.data?.candidates?.[0];
        const text = cand?.content?.parts?.[0]?.text || "{}";
        return LLMClient.parseJsonFromText(text);
      } catch (e) {
        // If provider returns structured error, prefer that message
        const msg = e?.response?.data?.error?.message || e?.message;
        lastErr = new Error(msg || "LLM request failed");
        if (attempt < retries) await sleep(300 * (attempt + 1));
      }
    }
    throw lastErr || new Error("LLM request failed");
  }

  // input: { contextText, numQuestions, difficulty, topics }
  async generateQuestions(input) {
    const { contextText = "", numQuestions = 10, difficulty = "Hiểu", topics = [] } = input || {};

    // Always use real Gemini API - production mode only
    if (!this.config.apiKey) {
      throw Object.assign(
        new Error('GEMINI_API_KEY is required for question generation'),
        { status: 500, code: 'MissingConfiguration' }
      );
    }

    const safeContext = String(contextText).slice(0, 20000);
    const prompt = `You are a learning assistant. Using ONLY the information from the provided context, generate ${numQuestions} multiple-choice questions (MCQs). Do not invent facts beyond the context.
Context (may be empty):\n${safeContext}\n\nTopics (optional): ${topics.join(", ")}\n
Return ONLY valid JSON (no markdown fences, no extra text) with shape: { "questions": [ { "questionId": string, "questionText": string, "options": [string,string,string,string], "correctAnswerIndex": number (0..3), "explanation": string, "difficultyLevel": "Biết"|"Hiểu"|"Vận dụng"|"Vận dụng cao" } ] }.
Ensure difficultyLevel is set to "${difficulty}" for all questions unless the context strongly suggests otherwise.`;

    if (String(process.env.LLM_DEBUG).toLowerCase() === "true" || process.env.LLM_DEBUG === "1") {
      // Log a trimmed prompt for debugging
      const toLog = prompt.length > 1500 ? `${prompt.slice(0, 1500)}... [trimmed]` : prompt;
      logger.debug({ prompt: toLog }, "[LLM] generateQuestions prompt");
    }

    const data = await this.callGeminiJSON(prompt);
    const questions = Array.isArray(data?.questions) ? data.questions : [];
    return { questions };
  }

  // input: { text }
  async summarize(input) {
    const { text = "" } = input || {};
    
    // Always use real Gemini API - production mode only
    if (!this.config.apiKey) {
      throw Object.assign(
        new Error('GEMINI_API_KEY is required for content summarization'),
        { status: 500, code: 'MissingConfiguration' }
      );
    }
    
    const safe = String(text).slice(0, 20000);
    const prompt = `Summarize the following content. Return ONLY valid JSON (no markdown fences, no extra text) with shape: { "summaryShort": string (<= 120 words), "summaryFull": string (<= 300 words) }.
Content:\n${safe}`;
    const data = await this.callGeminiJSON(prompt);
    return { summaryShort: data.summaryShort || "", summaryFull: data.summaryFull || "" };
  }

  // Utility: parse JSON even if model wraps in ```json fences or prefixes/suffixes
  static parseJsonFromText(text) {
    if (!text) throw new Error("Empty LLM response");
    let t = String(text).trim();
    // If wrapped in fences, extract inner
    const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced && fenced[1]) {
      t = fenced[1].trim();
    } else {
      // Remove single-line leading ```json and trailing ``` if present
      t = t
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }
    // Attempt direct parse
    try {
      return JSON.parse(t);
    } catch {}
    // Fallback: slice between first { and last }
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const sliced = t.slice(start, end + 1);
      try {
        return JSON.parse(sliced);
      } catch {}
    }
    throw new Error("Model did not return valid JSON");
  }
}

module.exports = LLMClient;
