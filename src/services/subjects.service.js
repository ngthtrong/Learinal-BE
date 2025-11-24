const SubjectsRepository = require("../repositories/subjects.repository");
const DocumentsRepository = require("../repositories/documents.repository");
const QuestionSetsRepository = require("../repositories/questionSets.repository");
const StorageClient = require("../adapters/storageClient");
const storageConfig = require("../config/storage");

function mapId(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

class SubjectsService {
  constructor() {
    this.repo = new SubjectsRepository();
    this.documentsRepo = new DocumentsRepository();
    this.questionSetsRepo = new QuestionSetsRepository();
    this.storageClient = new StorageClient(storageConfig);
  }

  async listByUser(userId, { page = 1, pageSize = 20 } = {}) {
    const { items, totalItems, totalPages } = await this.repo.paginate(
      { userId },
      { page, pageSize, sort: { createdAt: -1 } }
    );
    return { items: (items || []).map(mapId), totalItems, totalPages };
  }

  async create(userId, payload) {
    const toCreate = {
      userId,
      subjectName: payload.subjectName,
      description: payload.description,
      tableOfContents: payload.tableOfContents || [],
      summary: payload.summary,
    };
    const created = await this.repo.create(toCreate);
    return mapId(created);
  }

  async getByIdOwned(userId, id) {
    const found = await this.repo.findOne({ _id: id, userId });
    return mapId(found);
  }

  async updateOwned(userId, id, payload) {
    const allowed = {};
    if (payload.subjectName !== undefined) allowed.subjectName = payload.subjectName;
    if (payload.description !== undefined) allowed.description = payload.description;
    if (payload.tableOfContents !== undefined) allowed.tableOfContents = payload.tableOfContents;
    if (payload.summary !== undefined) allowed.summary = payload.summary;

    const updated = await this.repo.updateById(
      id,
      { $set: allowed },
      { new: true, runValidators: true }
    );
    if (!updated || String(updated.userId) !== String(userId)) return null;
    return mapId(updated);
  }

  async removeOwned(userId, id) {
    const found = await this.repo.findById(id);
    if (!found || String(found.userId) !== String(userId)) return false;

    // Lấy danh sách question sets để xóa quiz attempts
    const questionSets = await this.questionSetsRepo.findMany(
      { subjectId: id },
      { projection: "_id" }
    );
    const questionSetIds = questionSets.map((qs) => qs._id);

    // Xóa tất cả quiz attempts của các question sets
    if (questionSetIds.length > 0) {
      const QuizAttemptsRepository = require("../repositories/quizAttempts.repository");
      const quizAttemptsRepo = new QuizAttemptsRepository();
      await quizAttemptsRepo.deleteMany({ setId: { $in: questionSetIds } });
    }

    // Lấy danh sách documents để xóa files trong storage
    const documents = await this.documentsRepo.findMany(
      { subjectId: id },
      { projection: "storagePath" }
    );

    // Xóa files trong storage
    await Promise.allSettled(documents.map((doc) => this.storageClient.delete(doc.storagePath)));

    // Xóa các documents liên quan
    await this.documentsRepo.deleteMany({ subjectId: id });

    // Xóa các question sets liên quan
    await this.questionSetsRepo.deleteMany({ subjectId: id });

    // Xóa subject
    await this.repo.deleteById(id);
    return true;
  }
}

module.exports = SubjectsService;
