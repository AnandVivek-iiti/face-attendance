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

// Express 5 exposes req.query as a getter-only property, so plain assignment
// throws. Redefine it as an own property so both Express 4 and 5 work.
const assign = (req, key, value) => {
  if (key === 'query') {
    Object.defineProperty(req, 'query', { value, writable: true, configurable: true, enumerable: true });
  } else {
    req[key] = value;
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
    assign(req, key, result.data);
  }
  return next();
};

module.exports = validate;
