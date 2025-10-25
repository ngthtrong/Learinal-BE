class DocumentsService {
  constructor({ documentsRepository, storageClient }) {
    this.documentsRepository = documentsRepository;
    this.storageClient = storageClient;
  }
}

module.exports = DocumentsService;
