const asyncHandler = require('../utils/asyncHandler');
const departmentService = require('../services/departmentService');
const { success } = require('../utils/response');

const list = asyncHandler(async (req, res) => success(res, await departmentService.list()));

const create = asyncHandler(async (req, res) =>
  success(res, await departmentService.create(req.body, req.user), { status: 201 })
);

const update = asyncHandler(async (req, res) =>
  success(res, await departmentService.update(req.params.id, req.body))
);

const remove = asyncHandler(async (req, res) =>
  success(res, await departmentService.remove(req.params.id, req.user))
);

module.exports = { list, create, update, remove };
