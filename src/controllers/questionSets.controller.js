const QuestionSetsRepository = require('../repositories/questionSets.repository');
const DocumentsRepository = require('../repositories/documents.repository');
const { env, llm } = require('../config');
const LLMClient = require('../adapters/llmClient');

const repo = new QuestionSetsRepository();
const docRepo = new DocumentsRepository();

function mapId(doc) { if (!doc) return doc; const { _id, __v, ...rest } = doc; return { id: String(_id || rest.id), ...rest }; }

module.exports = {
  // GET /question-sets
  list: async (req, res, next) => {
    try {
      const user = req.user;
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
      const { items, totalItems, totalPages } = await repo.paginate({ userId: user.id }, { page, pageSize, sort: { createdAt: -1 } });
      res.status(200).json({ items: (items || []).map(mapId), meta: { page, pageSize, total: totalItems, totalPages } });
    } catch (e) { next(e); }
  },

  // POST /question-sets/generate (real: uses LLM when configured; else returns 503)
  generate: async (req, res, next) => {
    try {
      const user = req.user;
      const { subjectId, title, numQuestions = 10, difficulty = 'Hiểu' } = req.body || {};
      if (!subjectId || !title) {
        return res.status(400).json({ code: 'ValidationError', message: 'subjectId and title are required' });
      }
      if (numQuestions < 1 || numQuestions > 100) {
        return res.status(400).json({ code: 'ValidationError', message: 'numQuestions must be between 1 and 100' });
      }

      // Enforce real generation: require LLM configured
      const isReal = (process.env.LLM_MODE || env.llmMode) === 'real' && (llm.apiKey && llm.apiKey.length > 0);
      if (!isReal) {
        return res.status(503).json({ code: 'ServiceUnavailable', message: 'LLM not configured for real generation. Set LLM_MODE=real and provide GEMINI_API_KEY.' });
      }

      // Build context from user's documents in the subject (prefer summaries, then extracted text)
      let contextText = '';
      try {
        const docs = await docRepo.findMany(
          { subjectId, ownerId: user.id, status: 'Completed' },
          {
            projection: { originalFileName: 1, summaryShort: 1, summaryFull: 1, extractedText: 1 },
            sort: { uploadedAt: -1 },
            limit: 10,
          },
        );
        if (Array.isArray(docs) && docs.length > 0) {
          const parts = [];
          for (const d of docs) {
            const header = `Document: ${d.originalFileName || 'unknown'}`;
            const summary = d.summaryFull || d.summaryShort || '';
            const body = summary && summary.trim().length > 0
              ? summary
              : String(d.extractedText || '').slice(0, 3000); // cap per doc to keep prompt size reasonable
            if (body && body.trim().length > 0) {
              parts.push(`${header}\n${body}`);
            }
          }
          // Compose overall context with a hard cap to fit the LLM client's 20k slice
          contextText = parts.join('\n\n---\n\n');
          contextText = contextText.slice(0, 18000);
        }
      } catch (_) {
        // Non-fatal: if repository fails, fall back to title-only
      }

      // Fallback if no usable document context
      if (!contextText || contextText.trim().length === 0) {
        contextText = `Topic: ${title}`;
      }

      const client = new LLMClient(llm);
      const { questions } = await client.generateQuestions({
        contextText,
        numQuestions,
        difficulty,
      });

      const toCreate = {
        userId: user.id,
        subjectId,
        title,
        status: 'Draft',
        isShared: false,
        questions,
      };
      const created = await repo.create(toCreate);
      return res.status(201).json(mapId(created));
    } catch (e) { next(e); }
  },

  // GET /question-sets/:id
  get: async (req, res, next) => {
    try {
      const user = req.user;
      const item = await repo.findById(req.params.id);
      if (!item || String(item.userId) !== String(user.id)) return res.status(404).json({ code: 'NotFound', message: 'Not found' });
      res.status(200).json(mapId(item));
    } catch (e) { next(e); }
  },

  // PATCH /question-sets/:id
  update: async (req, res, next) => {
    try {
      const user = req.user;
      const allowed = {};
      ['title', 'status', 'isShared', 'sharedUrl', 'questions'].forEach((k) => { if (req.body[k] !== undefined) allowed[k] = req.body[k]; });
      const updated = await repo.updateById(req.params.id, { $set: allowed }, { new: true, runValidators: true });
      if (!updated || String(updated.userId) !== String(user.id)) return res.status(404).json({ code: 'NotFound', message: 'Not found' });
      res.status(200).json(mapId(updated));
    } catch (e) { next(e); }
  },

  // POST /question-sets/:id/share
  share: async (req, res, next) => {
    try {
      const user = req.user;
      const existing = await repo.findById(req.params.id);
      if (!existing || String(existing.userId) !== String(user.id)) return res.status(404).json({ code: 'NotFound', message: 'Not found' });
      const sharedUrl = `share_${existing._id || existing.id}_${Date.now()}`;
      const updated = await repo.updateById(req.params.id, { $set: { isShared: true, sharedUrl } }, { new: true });
      res.status(200).json(mapId(updated));
    } catch (e) { next(e); }
  },

  // POST /question-sets/:id/review
  requestReview: async (req, res, next) => {
    try {
      // Minimal stub: reply 202 with a fake ValidationRequest shape
      const id = req.params.id;
      const body = { id: `${id}-vr`, setId: id, status: 'PendingAssignment', requestTime: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      res.status(202).json(body);
    } catch (e) { next(e); }
  },
};
