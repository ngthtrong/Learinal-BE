function parseSort(sort) {
  if (!sort) return { createdAt: -1 };
  const fields = Array.isArray(sort) ? sort : [sort];
  return fields.reduce((acc, f) => {
    const dir = f.startsWith('-') ? -1 : 1;
    const key = f.replace(/^[-+]/, '');
    acc[key] = dir;
    return acc;
  }, {});
}

module.exports = { parseSort };
