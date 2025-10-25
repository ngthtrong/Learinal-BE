function buildPagination({ page = 1, pageSize = 20, totalItems = 0 }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return { page, pageSize, totalItems, totalPages };
}

module.exports = { buildPagination };
