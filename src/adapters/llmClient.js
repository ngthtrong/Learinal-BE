class LLMClient {
  constructor(config) {
    this.config = config;
  }
  async generateQuestions(/* input */) {
    // TODO: Call Gemini API
    throw new Error('NotImplemented');
  }
  async summarize(/* input */) {
    throw new Error('NotImplemented');
  }
}

module.exports = LLMClient;
