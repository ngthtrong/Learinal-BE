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

  // input: { contextText, numQuestions, difficulty, topics, difficultyDistribution, topicDistribution, tableOfContents }
  async generateQuestions(input) {
    const { 
      contextText = "", 
      numQuestions = 10, 
      difficulty = "Understand", 
      topics = [],
      difficultyDistribution = null, // { "Remember": 20, "Understand": 10, "Apply": 10, "Analyze": 10 }
      topicDistribution = null, // { "topic-id-1": 10, "topic-id-2": 20, ... }
      tableOfContents = [] // Mảng các topic từ subject hoặc document
    } = input || {};

    // Always use real Gemini API - production mode only
    if (!this.config.apiKey) {
      throw Object.assign(
        new Error('GEMINI_API_KEY is required for question generation'),
        { status: 500, code: 'MissingConfiguration' }
      );
    }

    const safeContext = String(contextText).slice(0, 20000);
    
    // Build prompt based on distribution type
    let distributionInstructions = "";
    let topicInstructions = "";
    
    // Handle difficulty distribution
    if (difficultyDistribution && typeof difficultyDistribution === 'object') {
      const distribParts = [];
      let totalDist = 0;
      for (const [level, count] of Object.entries(difficultyDistribution)) {
        if (count > 0) {
          distribParts.push(`${count} câu hỏi mức độ "${level}"`);
          totalDist += count;
        }
      }
      if (distribParts.length > 0 && totalDist > 0) {
        distributionInstructions = `\nPhân bố độ khó: ${distribParts.join(", ")}. Tổng cộng ${totalDist} câu hỏi.`;
      }
    }
    
    // Handle topic distribution and table of contents
    if (tableOfContents && Array.isArray(tableOfContents) && tableOfContents.length > 0) {
      const tocJson = JSON.stringify(tableOfContents, null, 2);
      topicInstructions = `\nMục lục (Table of Contents):\n${tocJson}\n`;
      
      if (topicDistribution && typeof topicDistribution === 'object') {
        const topicDistParts = [];
        for (const [topicId, count] of Object.entries(topicDistribution)) {
          if (count > 0) {
            topicDistParts.push(`  - topicId "${topicId}": ${count} câu`);
          }
        }
        if (topicDistParts.length > 0) {
          topicInstructions += `\nPhân bố câu hỏi theo topic:\n${topicDistParts.join("\n")}\n`;
          topicInstructions += `\nQuan trọng: Mỗi câu hỏi PHẢI có trường "topicId" tương ứng với một topicId trong mục lục ở trên.`;
        }
      } else {
        topicInstructions += `\nGợi ý: Gắn mỗi câu hỏi với một topicId phù hợp từ mục lục (nếu có thể xác định được).`;
      }
    }

    const prompt = `You are a learning assistant. Using ONLY the information from the provided context, generate multiple-choice questions (MCQs). Do not invent facts beyond the context.
Context (may be empty):\n${safeContext}\n
Topics (optional): ${topics.join(", ")}
${topicInstructions}${distributionInstructions}

Return ONLY valid JSON (no markdown fences, no extra text) with shape: 
{ 
  "questions": [ 
    { 
      "questionId": string, 
      "questionText": string, 
      "options": [string,string,string,string], 
      "correctAnswerIndex": number (0..3), 
      "explanation": string, 
      "difficultyLevel": "Remember"|"Understand"|"Apply"|"Analyze",
      "topicId": string (optional - ID của topic trong mục lục mà câu hỏi thuộc về)
    } 
  ] 
}

Difficulty levels explained:
- "Remember": Basic recall of facts, terms, concepts (Bloom's Taxonomy Level 1)
- "Understand": Comprehension and explanation of ideas (Bloom's Taxonomy Level 2)
- "Apply": Use information in new situations (Bloom's Taxonomy Level 3)
- "Analyze": Break down and examine components, relationships (Bloom's Taxonomy Level 4)

${distributionInstructions ? 'Follow the difficulty distribution specified above exactly.' : `Ensure difficultyLevel is set to "${difficulty}" for all questions unless the context strongly suggests otherwise.`}
${topicDistribution ? 'Follow the topic distribution specified above exactly.' : ''}`;

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

  // input: { text }
  async generateTableOfContents(input) {
    const { text = "" } = input || {};
    
    // Always use real Gemini API - production mode only
    if (!this.config.apiKey) {
      throw Object.assign(
        new Error('GEMINI_API_KEY is required for table of contents generation'),
        { status: 500, code: 'MissingConfiguration' }
      );
    }
    
    const safe = String(text).slice(0, 20000);
    const prompt = `Analyze the following document content and generate a hierarchical table of contents (TOC). 
Extract the main topics, chapters, sections, and subsections based on the document structure.

Return ONLY valid JSON (no markdown fences, no extra text) with shape:
{
  "tableOfContents": [
    {
      "topicId": string (generate unique ID like "topic-1", "topic-2", etc.),
      "topicName": string (the topic/chapter/section name),
      "childTopics": [
        {
          "topicId": string,
          "topicName": string,
          "childTopics": []
        }
      ]
    }
  ]
}

Guidelines:
- Generate unique topicId for each topic (e.g., "topic-1", "topic-1-1", "topic-1-2")
- Keep topicName concise and descriptive
- Support nested structure with childTopics array
- If no clear structure found, create a simple flat list of main topics
- Maximum 3 levels of nesting recommended

Content:\n${safe}`;

    if (String(process.env.LLM_DEBUG).toLowerCase() === "true" || process.env.LLM_DEBUG === "1") {
      const toLog = prompt.length > 1500 ? `${prompt.slice(0, 1500)}... [trimmed]` : prompt;
      logger.debug({ prompt: toLog }, "[LLM] generateTableOfContents prompt");
    }

    const data = await this.callGeminiJSON(prompt);
    const tableOfContents = Array.isArray(data?.tableOfContents) ? data.tableOfContents : [];
    return { tableOfContents };
  }

  // input: { documents } - array of document summaries/TOCs
  async generateSubjectTableOfContents(input) {
    const { documents = [] } = input || {};
    
    // Always use real Gemini API - production mode only
    if (!this.config.apiKey) {
      throw Object.assign(
        new Error('GEMINI_API_KEY is required for subject table of contents generation'),
        { status: 500, code: 'MissingConfiguration' }
      );
    }
    
    // Build context from all documents in the subject
    let contextText = "";
    if (Array.isArray(documents) && documents.length > 0) {
      const docParts = [];
      for (const doc of documents) {
        const parts = [];
        if (doc.originalFileName) {
          parts.push(`Document: ${doc.originalFileName}`);
        }
        if (doc.summaryFull || doc.summaryShort) {
          parts.push(`Summary: ${doc.summaryFull || doc.summaryShort}`);
        }
        if (doc.tableOfContents && Array.isArray(doc.tableOfContents) && doc.tableOfContents.length > 0) {
          const topicNames = doc.tableOfContents.map(t => t.topicName).join(", ");
          parts.push(`Topics: ${topicNames}`);
        }
        if (parts.length > 0) {
          docParts.push(parts.join("\n"));
        }
      }
      contextText = docParts.join("\n\n---\n\n");
    }
    
    const safe = String(contextText).slice(0, 20000);
    const prompt = `Based on the following documents in a subject, generate a HIGH-LEVEL table of contents for the entire subject.
This should be a FLAT LIST (only 1 level - no nested childTopics) of main chapters/topics that cover all the documents.

Documents information:
${safe}

Return ONLY valid JSON (no markdown fences, no extra text) with shape:
{
  "tableOfContents": [
    {
      "topicId": string (generate unique ID like "chapter-1", "chapter-2", etc.),
      "topicName": string (the main chapter/topic name),
      "childTopics": []
    }
  ]
}

Guidelines:
- ONLY 1 LEVEL - NO nested childTopics (keep childTopics as empty array [])
- Generate 5-15 main chapters/topics that summarize the entire subject
- Use "chapter-1", "chapter-2", etc. for topicId
- Keep topicName concise and descriptive (e.g., "Chương 1: Giới thiệu", "Chapter 2: Data Structures")
- Organize logically from foundational to advanced topics
- If documents cover similar topics, merge them into one chapter

Example output:
{
  "tableOfContents": [
    {"topicId": "chapter-1", "topicName": "Chương 1: Giới thiệu cơ bản", "childTopics": []},
    {"topicId": "chapter-2", "topicName": "Chương 2: Cấu trúc dữ liệu", "childTopics": []},
    {"topicId": "chapter-3", "topicName": "Chương 3: Thuật toán", "childTopics": []}
  ]
}`;

    if (String(process.env.LLM_DEBUG).toLowerCase() === "true" || process.env.LLM_DEBUG === "1") {
      const toLog = prompt.length > 1500 ? `${prompt.slice(0, 1500)}... [trimmed]` : prompt;
      logger.debug({ prompt: toLog }, "[LLM] generateSubjectTableOfContents prompt");
    }

    const data = await this.callGeminiJSON(prompt);
    const tableOfContents = Array.isArray(data?.tableOfContents) ? data.tableOfContents : [];
    
    // Ensure all items have empty childTopics array (enforce flat structure)
    const flatTOC = tableOfContents.map(item => ({
      topicId: item.topicId || `chapter-${Date.now()}`,
      topicName: item.topicName || "Unknown Chapter",
      childTopics: []
    }));
    
    return { tableOfContents: flatTOC };
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
