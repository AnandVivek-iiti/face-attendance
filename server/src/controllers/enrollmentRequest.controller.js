const asyncHandler = require('../utils/asyncHandler');
const enrollmentRequestService = require('../services/enrollmentRequestService');
const { success } = require('../utils/response');

const list = asyncHandler(async (req, res) =>
  success(res, await enrollmentRequestService.listForProfessor(req.user))
);

const listMine = asyncHandler(async (req, res) =>
  success(res, await enrollmentRequestService.listForStudent(req.user))
);

const approve = asyncHandler(async (req, res) =>
  success(res, await enrollmentRequestService.approve(req.params.id, req.user, req.body?.note))
);

const reject = asyncHandler(async (req, res) =>
  success(res, await enrollmentRequestService.reject(req.params.id, req.user, req.body?.note))
);

module.exports = { list, listMine, approve, reject };
