const toPagination = ({ page, limit }, total) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
});

const skipFor = ({ page, limit }) => (page - 1) * limit;

module.exports = { toPagination, skipFor };
