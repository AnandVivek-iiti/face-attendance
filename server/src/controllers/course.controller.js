const asyncHandler = require('../utils/asyncHandler');
const courseService = require('../services/courseService');
const { success } = require('../utils/response');

const list = asyncHandler(async (req, res) => success(res, await courseService.list(req.user)));

const listAll = asyncHandler(async (req, res) => success(res, await courseService.listAll(req.user)));

const create = asyncHandler(async (req, res) =>
  success(res, await courseService.create(req.body, req.user), { status: 201 })
);

const getOne = asyncHandler(async (req, res) =>
  success(res, await courseService.getOne(req.user, req.params.id))
);

const update = asyncHandler(async (req, res) =>
  success(res, await courseService.update(req.params.id, req.body, req.user))
);

const remove = asyncHandler(async (req, res) =>
  success(res, await courseService.remove(req.params.id, req.user))
);

const listProfessors = asyncHandler(async (req, res) => success(res, await courseService.listProfessors()));

const addProfessor = asyncHandler(async (req, res) =>
  success(res, await courseService.addProfessor(req.body, req.user), { status: 201 })
);

module.exports = { list, listAll, create, getOne, update, remove, listProfessors, addProfessor };
