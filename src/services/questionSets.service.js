class QuestionSetsService {
  constructor({ questionSetsRepository, llmClient }) {
    this.questionSetsRepository = questionSetsRepository;
    this.llmClient = llmClient;
  }
}

module.exports = QuestionSetsService;
