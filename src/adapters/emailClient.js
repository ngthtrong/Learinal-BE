class EmailClient {
  constructor(config) {
    this.config = config;
  }
  async send(/* to, subject, templateId, variables */) {
    // TODO: Implement via SendGrid or SES
    throw new Error('NotImplemented');
  }
}

module.exports = EmailClient;
