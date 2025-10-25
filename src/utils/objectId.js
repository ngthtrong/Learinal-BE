const { Types } = require('mongoose');

function toObjectId(id) {
  if (id instanceof Types.ObjectId) return id;
  if (Types.ObjectId.isValid(id)) return new Types.ObjectId(id);
  return id; // fall back unchanged
}

module.exports = { toObjectId };
