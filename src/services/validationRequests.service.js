class ValidationRequestsService {
  constructor({ validationRequestsRepository, emailClient }) {
    this.validationRequestsRepository = validationRequestsRepository;
    this.emailClient = emailClient;
  }
}

module.exports = ValidationRequestsService;
