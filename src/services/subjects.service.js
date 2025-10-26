const SubjectsRepository = require('../repositories/subjects.repository');

function mapId(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id || rest.id), ...rest };
}

class SubjectsService {
  constructor() {
    this.repo = new SubjectsRepository();
  }

  async listByUser(userId, { page = 1, pageSize = 20 } = {}) {
    const { items, totalItems, totalPages } = await this.repo.paginate({ userId }, { page, pageSize, sort: { createdAt: -1 } });
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

    const updated = await this.repo.updateById(id, { $set: allowed }, { new: true, runValidators: true });
    if (!updated || String(updated.userId) !== String(userId)) return null;
    return mapId(updated);
  }

  async removeOwned(userId, id) {
    const found = await this.repo.findById(id);
    if (!found || String(found.userId) !== String(userId)) return false;
    await this.repo.deleteById(id);
    return true;
  }
}

module.exports = SubjectsService;
