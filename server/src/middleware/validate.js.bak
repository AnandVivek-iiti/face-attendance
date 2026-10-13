const AppError = require('../utils/AppError');

const validate = (schemas) => (req, res, next) => {
  for (const key of ['params', 'query', 'body']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key] || {});
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message
      }));
      const first = details[0];
      const message = first.field ? `${first.field}: ${first.message}` : first.message;
      return next(new AppError(`Validation failed - ${message}`, 400, { code: 'VALIDATION_ERROR', details }));
    }
    req[key] = result.data;
  }
  return next();
};

module.exports = validate;
