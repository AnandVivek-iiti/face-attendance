const asyncHandler = require('../utils/asyncHandler');
const courseService = require('../services/courseService');
const { success } = require('../utils/response');

const list = asyncHandler(async (req, res) => success(res, await courseService.list(req.user)));

const create = asyncHandler(async (req, res) =>
  success(res, await courseService.create(req.body), { status: 201 })
);

const getOne = asyncHandler(async (req, res) =>
  success(res, await courseService.getOne(req.user, req.params.id))
);

module.exports = { list, create, getOne };
