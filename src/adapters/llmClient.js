const logger = require("../utils/logger");
const axios = require("axios");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class LLMClient {
  constructor(config) {
    this.config = config; // { model, apiKey, timeoutMs, retries }
    logger.info({ model: config.model }, "[LLMClient] initialized with model");
  }

  get endpoint() {
    const model = this.config.model || "gemini-2.0-flash";
    const base = "https://generativelanguage.googleapis.com/v1";
    const path = model.startsWith("models/")
      ? `${model}:generateContent`
      : `models/${model}:generateContent`;
    return `${base}/${path}`;
  }

  async callGeminiJSON(prompt) {
    const { apiKey, timeoutMs = 30000, retries = 3 } = this.config;
    const url = `${this.endpoint}?key=${encodeURIComponent(apiKey)}`;
    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // Keep minimal generationConfig; enforce JSON via prompt for broad API compatibility
      generationConfig: { temperature: 0.2 },
    };
    let lastErr;
    
    // For quota errors, use more retries with longer delays
    const maxRetries = retries;
    
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const res = await axios.post(url, body, { timeout: timeoutMs });
        const cand = res?.data?.candidates?.[0];
        const text = cand?.content?.parts?.[0]?.text || "{}";
        return LLMClient.parseJsonFromText(text);
      } catch (e) {
        // If provider returns structured error, prefer that message
        const msg = e?.response?.data?.error?.message || e?.message;
        lastErr = new Error(msg || "LLM request failed");
        
        // Check for quota/rate limit errors - need longer delay
        const isQuotaError = msg?.includes("quota") || msg?.includes("exhausted") || msg?.includes("rate") || e?.response?.status === 429;
        
        if (attempt < maxRetries) {
          // For quota errors: wait 30s, 60s, 90s (Gemini free tier resets per minute)
          // For other errors: 1s, 2s, 4s
          let delay;
          if (isQuotaError) {
            delay = 30000 * (attempt + 1); // 30s, 60s, 90s
            logger.warn({ attempt: attempt + 1, maxRetries, delaySeconds: delay / 1000, error: msg }, "[LLM] Quota exceeded, waiting for reset...");
          } else {
            delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
            logger.warn({ attempt: attempt + 1, maxRetries, delay, error: msg }, "[LLM] Retrying after error");
          }
          await sleep(delay);
        } else {
          logger.error({ attempt: attempt + 1, maxRetries, isQuotaError, error: msg }, "[LLM] All retries exhausted");
        }
      }
    }
    throw lastErr || new Error("LLM request failed");
  }

  // input: { contextText, numQuestions, difficulty, topics, difficultyDistribution, topicDistribution, tableOfContents, language }
  async generateQuestions(input) {
    const { 
      contextText = "", 
      numQuestions = 10, 
      difficulty = "Understand", 
      topics = [],
      difficultyDistribution = null, // { "Remember": 20, "Understand": 10, "Apply": 10, "Analyze": 10 }
      topicDistribution = null, // { "topic-id-1": 10, "topic-id-2": 20, ... }
      tableOfContents = [], // Mảng các topic từ subject hoặc document
      language = "vi" // "vi" for Vietnamese, "en" for English
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
    
    // Calculate total questions from distribution or use numQuestions
    let totalQuestionsToGenerate = numQuestions;
    
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
        totalQuestionsToGenerate = totalDist;
        distributionInstructions = `\nPhân bố độ khó: ${distribParts.join(", ")}. Tổng cộng CHÍNH XÁC ${totalDist} câu hỏi.`;
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

    // Build the quantity instruction
    const quantityInstruction = distributionInstructions 
      ? distributionInstructions 
      : `\n**QUAN TRỌNG: Tạo CHÍNH XÁC ${totalQuestionsToGenerate} câu hỏi. Không nhiều hơn, không ít hơn.**`;

    // Build language instruction
    const isVietnamese = language === "vi";
    const languageInstruction = isVietnamese
      ? `\n**NGÔN NGỮ: Tất cả câu hỏi, đáp án và giải thích PHẢI được viết bằng TIẾNG VIỆT. Không sử dụng tiếng Anh.**`
      : `\n**LANGUAGE: ALL questions, options, and explanations MUST be written in ENGLISH. You can read Vietnamese context but must write questions in English. Translate concepts if needed but write everything in English.**`;

    const prompt = `You are a learning assistant. Using ONLY the information from the provided context, generate multiple-choice questions (MCQs). Do not invent facts beyond the context.

**CRITICAL REQUIREMENT: You MUST generate EXACTLY ${totalQuestionsToGenerate} questions. Not more, not less.**
${languageInstruction}

Context (may be empty):\n${safeContext}\n
Topics (optional): ${topics.join(", ")}
${topicInstructions}${quantityInstruction}

Return ONLY valid JSON (no markdown fences, no extra text) with shape: 
{ 
  "questions": [ 
    { 
      "questionId": string, 
      "questionText": string, 
      "options": [string,string,string,string], 
      "correctAnswerIndex": number (0..3), 
      "explanation": string, 
      "difficultyLevel": "Remember"|"Understand"|"Apply"|"Analyze"|"Evaluate"|"Create",
      "topicId": string (optional - ID của topic trong mục lục mà câu hỏi thuộc về)
    } 
  ] 
}

Difficulty levels explained (Bloom's Taxonomy - 6 levels):
- "Remember": Basic recall of facts, terms, concepts (Level 1 - Ghi nhớ)
- "Understand": Comprehension and explanation of ideas (Level 2 - Hiểu)
- "Apply": Use information in new situations (Level 3 - Áp dụng)
- "Analyze": Break down and examine components, relationships (Level 4 - Phân tích)
- "Evaluate": Make judgments based on criteria and standards (Level 5 - Đánh giá)
- "Create": Produce new or original work, design, compose (Level 6 - Sáng tạo)

${distributionInstructions ? 'Follow the difficulty distribution specified above exactly.' : `Ensure difficultyLevel is set to "${difficulty}" for all questions unless the context strongly suggests otherwise.`}
${topicDistribution ? 'Follow the topic distribution specified above exactly.' : ''}

**REMINDER: The questions array MUST contain EXACTLY ${totalQuestionsToGenerate} question objects.**`;

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

STRICT OUTPUT FORMAT - Return ONLY valid JSON with this EXACT structure:
{
  "tableOfContents": [
    {
      "topicId": "topic-1",
      "topicName": "Tên chương/phần",
      "childTopics": [
        {
          "topicId": "topic-1-1",
          "topicName": "Tên mục con",
          "childTopics": []
        }
      ]
    }
  ]
}

MANDATORY RULES:
1. "topicId" MUST be a string starting with "topic-" followed by numbers (e.g., "topic-1", "topic-1-1", "topic-2-3-1")
2. "topicName" MUST be a non-empty string (the topic/chapter/section name)
3. "childTopics" MUST be an array (can be empty [] if no children)
4. Every object MUST have all 3 fields: topicId, topicName, childTopics
5. Maximum 3 levels of nesting
6. NO additional fields, NO markdown, NO explanation text

Example valid output:
{"tableOfContents":[{"topicId":"topic-1","topicName":"Introduction","childTopics":[{"topicId":"topic-1-1","topicName":"Overview","childTopics":[]}]},{"topicId":"topic-2","topicName":"Main Content","childTopics":[]}]}

Content to analyze:
${safe}`;

    if (String(process.env.LLM_DEBUG).toLowerCase() === "true" || process.env.LLM_DEBUG === "1") {
      const toLog = prompt.length > 1500 ? `${prompt.slice(0, 1500)}... [trimmed]` : prompt;
      logger.debug({ prompt: toLog }, "[LLM] generateTableOfContents prompt");
    }

    const data = await this.callGeminiJSON(prompt);
    const rawTOC = Array.isArray(data?.tableOfContents) ? data.tableOfContents : [];
    
    // Validate and normalize TOC to ensure correct format
    const tableOfContents = LLMClient.normalizeTOC(rawTOC, "topic");
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

STRICT OUTPUT FORMAT - Return ONLY valid JSON with this EXACT structure:
{
  "tableOfContents": [
    {"topicId": "chapter-1", "topicName": "Tên chương", "childTopics": []},
    {"topicId": "chapter-2", "topicName": "Tên chương", "childTopics": []}
  ]
}

MANDATORY RULES:
1. "topicId" MUST be a string: "chapter-1", "chapter-2", "chapter-3", etc.
2. "topicName" MUST be a non-empty string describing the chapter
3. "childTopics" MUST be an empty array []
4. Every object MUST have exactly 3 fields: topicId, topicName, childTopics
5. Generate 5-15 main chapters that cover the entire subject
6. NO nested structures, NO additional fields, NO markdown, NO explanation text
7. Organize logically from foundational to advanced topics

Example valid output:
{"tableOfContents":[{"topicId":"chapter-1","topicName":"Giới thiệu cơ bản","childTopics":[]},{"topicId":"chapter-2","topicName":"Cấu trúc dữ liệu","childTopics":[]},{"topicId":"chapter-3","topicName":"Thuật toán","childTopics":[]}]}`;

    if (String(process.env.LLM_DEBUG).toLowerCase() === "true" || process.env.LLM_DEBUG === "1") {
      const toLog = prompt.length > 1500 ? `${prompt.slice(0, 1500)}... [trimmed]` : prompt;
      logger.debug({ prompt: toLog }, "[LLM] generateSubjectTableOfContents prompt");
    }

    const data = await this.callGeminiJSON(prompt);
    const rawTOC = Array.isArray(data?.tableOfContents) ? data.tableOfContents : [];
    
    // Validate and normalize TOC to ensure correct flat format
    const tableOfContents = LLMClient.normalizeTOC(rawTOC, "chapter", true);
    
    return { tableOfContents };
  }

  /**
   * Normalize and validate TOC items to ensure correct format
   * @param {Array} items - Raw TOC items from LLM
   * @param {string} prefix - ID prefix ("topic" or "chapter")
   * @param {boolean} forceFlat - If true, flatten all nested items
   * @param {string} parentId - Parent ID for nested items
   * @returns {Array} Normalized TOC items
   */
  static normalizeTOC(items, prefix = "topic", forceFlat = false, parentId = "") {
    if (!Array.isArray(items)) return [];
    
    const result = [];
    let index = 1;
    
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      
      // Generate proper topicId if missing or invalid
      const baseId = parentId ? `${parentId}-${index}` : `${prefix}-${index}`;
      let topicId = item.topicId;
      
      // Validate topicId format
      if (!topicId || typeof topicId !== 'string' || !topicId.match(/^(topic|chapter)-[\d-]+$/)) {
        topicId = baseId;
      }
      
      // Validate and clean topicName
      let topicName = item.topicName || item.name || item.title || "";
      if (typeof topicName !== 'string') {
        topicName = String(topicName);
      }
      topicName = topicName.trim();
      
      // Skip items without a name
      if (!topicName) {
        continue;
      }
      
      // Handle childTopics
      let childTopics = [];
      if (!forceFlat && Array.isArray(item.childTopics) && item.childTopics.length > 0) {
        childTopics = LLMClient.normalizeTOC(item.childTopics, prefix, false, topicId);
      }
      
      result.push({
        topicId,
        topicName,
        childTopics
      });
      
      // If forceFlat is true and there are nested items, flatten them
      if (forceFlat && Array.isArray(item.childTopics) && item.childTopics.length > 0) {
        const flattenedChildren = LLMClient.normalizeTOC(item.childTopics, prefix, true, "");
        for (const child of flattenedChildren) {
          child.topicId = `${prefix}-${result.length + 1}`;
          result.push(child);
        }
      }
      
      index++;
    }
    
    return result;
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
