const QuestionSetsRepository = require("../repositories/questionSets.repository");
const DocumentsRepository = require("../repositories/documents.repository");
const { llm } = require("../config");
const LLMClient = require("../adapters/llmClient");

module.exports = async function questionsGenerate(payload) {
  const { questionSetId, documentId, numQuestions = 10, difficulty = "Hiểu" } = payload || {};
  if (!questionSetId) return;
  const qrepo = new QuestionSetsRepository();
  const drepo = new DocumentsRepository();
  const qset = await qrepo.findById(questionSetId);
  if (!qset) return;

  let contextText = "";
  if (documentId) {
    const doc = await drepo.findById(documentId);
    contextText = doc?.extractedText || "";
  }

  const client = new LLMClient(llm);
  try {
    const result = await client.generateQuestions({
      contextText,
      numQuestions,
      difficulty,
      topics: [],
    });
    if (Array.isArray(result.questions) && result.questions.length) {
      await qrepo.updateById(
        questionSetId,
        { $set: { questions: result.questions } },
        { new: true }
      );
    }
  } catch {
    // leave as-is on error
  }
};
