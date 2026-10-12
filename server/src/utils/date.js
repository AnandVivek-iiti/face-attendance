const AppError = require('./AppError');

const parseDateOnly = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!valid) throw new AppError('Invalid date', 400, { code: 'INVALID_DATE' });
  return date;
};

const todayDateOnly = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};

module.exports = { parseDateOnly, todayDateOnly };
