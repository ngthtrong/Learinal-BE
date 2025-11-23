// Pagination helpers for consistent API responses
// Defaults: page >= 1, pageSize in [1..100], default 20

function clampPage(page) {
  const p = Number.parseInt(page, 10);
  return Number.isFinite(p) && p >= 1 ? p : 1;
}

function clampPageSize(pageSize) {
  const s = Number.parseInt(pageSize, 10);
  if (!Number.isFinite(s)) return 20;
  if (s < 1) return 1;
  if (s > 100) return 100;
  return s;
}

function getSkip(page, pageSize) {
  const p = clampPage(page);
  const s = clampPageSize(pageSize);
  return (p - 1) * s;
}

function buildPaginationMeta(totalItems, page, pageSize) {
  const p = clampPage(page);
  const s = clampPageSize(pageSize);
  const total = Math.max(0, Number.isFinite(totalItems) ? totalItems : 0);
  const totalPages = Math.max(1, Math.ceil(total / s || 1));
  return { page: p, pageSize: s, totalItems: total, totalPages };
}

function buildPaginationResponse(items, meta) {
  return { items: Array.isArray(items) ? items : [], meta };
}

function parsePagination(query = {}) {
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize);
  const sort = typeof query.sort === "string" ? query.sort : undefined;
  return { page, pageSize, sort };
}

module.exports = {
  clampPage,
  clampPageSize,
  getSkip,
  buildPaginationMeta,
  buildPaginationResponse,
  parsePagination,
};
