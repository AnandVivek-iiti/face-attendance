const asyncHandler = require('../utils/asyncHandler');
const courseService = require('../services/courseService');
const courseEnrollmentService = require('../services/courseEnrollmentService');
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

const listStudents = asyncHandler(async (req, res) =>
  success(res, await courseEnrollmentService.listCourseStudents(req.user, req.params.id))
);

const enrollStudents = asyncHandler(async (req, res) =>
  success(res, await courseEnrollmentService.enrollByRollNumbers(req.user, req.params.id, req.body.rollNumbers))
);

const removeStudent = asyncHandler(async (req, res) =>
  success(res, await courseEnrollmentService.removeFromCourse(req.user, req.params.id, req.params.studentId))
);

const listProfessors = asyncHandler(async (req, res) => success(res, await courseService.listProfessors()));

const addProfessor = asyncHandler(async (req, res) =>
  success(res, await courseService.addProfessor(req.body, req.user), { status: 201 })
);

const updateProfessor = asyncHandler(async (req, res) =>
  success(res, await courseService.updateProfessor(req.params.id, req.body, req.user))
);

const removeProfessor = asyncHandler(async (req, res) =>
  success(res, await courseService.removeProfessor(req.params.id, req.user))
);

// Resend the one-time sign-in link.
const inviteProfessor = asyncHandler(async (req, res) =>
  success(res, await courseService.inviteProfessor(req.params.id, req.user))
);

// Issue a fresh random password AND sign-in link for the professor.
const regenerateProfessor = asyncHandler(async (req, res) =>
  success(res, await courseService.regenerateProfessorCredentials(req.params.id, req.user))
);

module.exports = {
  list,
  listAll,
  create,
  getOne,
  listStudents,
  enrollStudents,
  removeStudent,
  update,
  remove,
  listProfessors,
  addProfessor,
  updateProfessor,
  removeProfessor,
  inviteProfessor,
  regenerateProfessor
};
