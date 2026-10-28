const asyncHandler = require('../utils/asyncHandler');
const studentService = require('../services/studentService');
const { success } = require('../utils/response');

const list = asyncHandler(async (req, res) => {
  const { students, pagination } = await studentService.list(req.user, req.query);
  return success(res, students, { pagination });
});

const create = asyncHandler(async (req, res) =>
  success(res, await studentService.create(req.body), { status: 201 })
);

const getOne = asyncHandler(async (req, res) =>
  success(res, await studentService.getOne(req.user, req.params.id))
);

const update = asyncHandler(async (req, res) =>
  success(res, await studentService.update(req.user, req.params.id, req.body))
);

const remove = asyncHandler(async (req, res) =>
  success(res, await studentService.remove(req.params.id))
);

const registerFace = asyncHandler(async (req, res) =>
  success(res, await studentService.registerFace(req.params.id, req.files), { status: 201 })
);

const generateEmbedding = asyncHandler(async (req, res) =>
  success(res, await studentService.generateEmbedding(req.params.id))
);

const profile = asyncHandler(async (req, res) =>
  success(res, await studentService.buildProfile(req.user, req.files, req.body), { status: 201 })
);

const attendance = asyncHandler(async (req, res) =>
  success(res, await studentService.getAttendance(req.user))
);

const myProfile = asyncHandler(async (req, res) =>
  success(res, await studentService.getProfile(req.user))
);

module.exports = { list, create, getOne, update, remove, registerFace, generateEmbedding, profile, attendance, myProfile };
