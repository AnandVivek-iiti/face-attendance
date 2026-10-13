const fs = require('fs');
const AppError = require('../utils/AppError');

// When a multipart request fails validation the uploaded temp files would be
// orphaned. Remove them (best effort) before rejecting.
const discardUploads = (req) => {
  const files = req.files || (req.file ? [req.file] : []);
  for (const file of files) {
    if (file && file.path) fs.promises.unlink(file.path).catch(() => {});
  }
};

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
      discardUploads(req);
      return next(new AppError(`Validation failed - ${message}`, 400, { code: 'VALIDATION_ERROR', details }));
    }
    req[key] = result.data;
  }
  return next();
};

module.exports = validate;
