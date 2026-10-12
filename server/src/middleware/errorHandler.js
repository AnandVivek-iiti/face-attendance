const multer = require('multer');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const fromMulter = (error) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    const mb = (env.uploadMaxSize / (1024 * 1024)).toFixed(1);
    return new AppError(`File too large (max ${mb} MB)`, 413, { code: 'FILE_TOO_LARGE' });
  }
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError(`Unexpected or too many files for field "${error.field}"`, 400, { code: 'INVALID_UPLOAD' });
  }
  return new AppError(`Invalid upload: ${error.message}`, 400, { code: 'INVALID_UPLOAD' });
};

const normalize = (error) => {
  if (error instanceof AppError) return error;
  if (error instanceof multer.MulterError) return fromMulter(error);
  if (error.type === 'entity.parse.failed') return new AppError('Invalid JSON body', 400, { code: 'INVALID_JSON' });
  if (error.type === 'entity.too.large') return new AppError('Request body too large', 413);
  if (error.name === 'CastError') return new AppError(`Invalid ${error.path}`, 400, { code: 'INVALID_ID' });
  if (error.name === 'ValidationError' && error.errors) {
    const details = Object.values(error.errors).map((item) => ({ field: item.path, message: item.message }));
    return new AppError(`Validation failed - ${details[0].field}: ${details[0].message}`, 400, {
      code: 'VALIDATION_ERROR',
      details
    });
  }
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || 'value';
    return new AppError(`${field} already exists`, 409, { code: 'DUPLICATE_KEY' });
  }
  return null;
};

const notFound = (req, res, next) => next(new AppError('Route not found', 404, { code: 'NOT_FOUND' }));

const errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);

  let handled = normalize(error);
  if (!handled) {
    console.error(error);
    handled = new AppError('Internal server error', 500);
  } else if (handled.statusCode >= 500) {
    console.error(`[${handled.code || 'ERROR'}] ${handled.message}`);
  }

  const body = { success: false, message: handled.message };
  if (handled.code) body.code = handled.code;
  if (handled.details) body.details = handled.details;
  return res.status(handled.statusCode).json(body);
};

module.exports = { notFound, errorHandler };
