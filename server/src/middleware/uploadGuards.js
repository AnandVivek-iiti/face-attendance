const asyncHandler = require('../utils/asyncHandler');
const sessionService = require('../services/sessionService');
const studentService = require('../services/studentService');

const sessionUploadGuard = asyncHandler(async (req, res, next) => {
  await sessionService.getUploadableSession(req.params.id, req.user);
  next();
});

const studentUploadGuard = asyncHandler(async (req, res, next) => {
  await studentService.getByRef(req.params.id);
  next();
});

module.exports = { sessionUploadGuard, studentUploadGuard };
