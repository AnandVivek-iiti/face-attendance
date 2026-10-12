const Course = require('../models/Course');
const User = require('../models/User');
const Student = require('../models/Student');
const AppError = require('../utils/AppError');
const { toObjectId } = require('../utils/objectId');
const { ROLES } = require('../config/constants');

const getById = async (id) => {
  const course = await Course.findById(toObjectId(id, 'course id'));
  if (!course) throw new AppError('Course not found', 404, { code: 'COURSE_NOT_FOUND' });
  return course;
};

const assertCanView = (user, course) => {
  if (user.role === ROLES.ADMIN) return;
  if (user.role === ROLES.PROFESSOR && course.professorId.equals(user._id)) return;
  throw new AppError('You are not authorized for this course', 403, { code: 'FORBIDDEN' });
};

const withEnrolledCount = async (course) => ({
  ...course.toJSON(),
  enrolledCount: await Student.countDocuments({
    semester: course.semester,
    section: course.section,
    active: true
  })
});

const list = async (user) => {
  const filter = user.role === ROLES.ADMIN ? {} : { professorId: user._id };
  const courses = await Course.find(filter).sort({ courseCode: 1, section: 1 });
  return Promise.all(courses.map(withEnrolledCount));
};

const create = async (data) => {
  const professor = await User.findOne({ _id: data.professorId, role: ROLES.PROFESSOR }).select('_id');
  if (!professor) throw new AppError('professorId does not belong to a professor', 400, { code: 'INVALID_PROFESSOR' });
  const course = await Course.create(data);
  return withEnrolledCount(course);
};

const getOne = async (user, id) => {
  const course = await getById(id);
  assertCanView(user, course);
  return withEnrolledCount(course);
};

module.exports = { getById, list, create, getOne };
