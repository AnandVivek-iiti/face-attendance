const mongoose = require('mongoose');
const AppError = require('./AppError');

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const isObjectId = (value) => typeof value === 'string' && OBJECT_ID_PATTERN.test(value);

const toObjectId = (value, label = 'id') => {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!isObjectId(value)) throw new AppError(`Invalid ${label}`, 400, { code: 'INVALID_ID' });
  return new mongoose.Types.ObjectId(value);
};

module.exports = { isObjectId, toObjectId };
