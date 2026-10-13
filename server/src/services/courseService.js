const Course = require('../models/Course');
const User = require('../models/User');
const Student = require('../models/Student');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');
const authService = require('./authService');
const { toObjectId } = require('../utils/objectId');
const { ROLES, AUDIT_ACTIONS, professorPasswordFor } = require('../config/constants');

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
  const filter =
    user.role === ROLES.ADMIN ? {} : user.role === ROLES.PROFESSOR ? { professorId: user._id } : { _id: null };
  const courses = await Course.find(filter).sort({ courseCode: 1, section: 1 });
  return Promise.all(courses.map(withEnrolledCount));
};

/** Every course, for students picking one to enroll in. */
const listAll = async () => {
  const courses = await Course.find().sort({ courseCode: 1, section: 1 });
  return Promise.all(courses.map(withEnrolledCount));
};

const assertProfessor = async (professorId) => {
  const professor = await User.findOne({ _id: professorId, role: ROLES.PROFESSOR }).select('_id email');
  if (!professor) throw new AppError('professorId does not belong to a professor', 400, { code: 'INVALID_PROFESSOR' });
  return professor;
};

/**
 * A professor's login password is auto-derived from the course they are first
 * assigned to: IIT@INDORE#<COURSE CODE>. If the professor already has one (from
 * an earlier course) it is left untouched, so teaching a second course never
 * locks them out.
 */
const ensureProfessorPassword = async (professorId, courseCode) => {
  const professor = await User.findById(professorId).select('+passwordHash passwordSetByCourse');
  if (!professor) return;
  if (professor.passwordSetByCourse) return;
  await User.updateOne(
    { _id: professorId },
    {
      $set: {
        passwordHash: await authService.hashPassword(professorPasswordFor(courseCode)),
        passwordSetByCourse: courseCode
      }
    }
  );
};

const create = async (data, actor) => {
  const professor = await assertProfessor(data.professorId);
  const course = await Course.create(data);
  await ensureProfessorPassword(course.professorId, course.courseCode);

  if (actor) {
    await auditService.record(
      auditService.userEntry(actor, {
        action: AUDIT_ACTIONS.COURSE_CREATED,
        after: { courseId: course._id, courseCode: course.courseCode, room: course.room || null }
      })
    );
  }
  return withEnrolledCount(await Course.findById(course._id));
};

const update = async (id, data, actor) => {
  const course = await getById(id);
  const previous = course.toObject();
  if (data.professorId !== undefined) await assertProfessor(data.professorId);
  course.set(data);
  await course.save();
  if (data.professorId !== undefined && !data.professorId.equals(previous.professorId)) {
    await ensureProfessorPassword(data.professorId, course.courseCode);
  }

  if (actor) {
    await auditService.record(
      auditService.userEntry(actor, {
        action: AUDIT_ACTIONS.COURSE_UPDATED,
        after: { courseId: course._id, changes: Object.keys(data) }
      })
    );
  }
  return withEnrolledCount(await Course.findById(course._id));
};

const remove = async (id, actor) => {
  const course = await getById(id);
  const { AttendanceSession } = require('../models/AttendanceSession');
  const sessionCount = await AttendanceSession.countDocuments({ courseId: course._id });
  if (sessionCount > 0) {
    throw new AppError('A course with attendance sessions cannot be removed', 409, {
      code: 'COURSE_HAS_SESSIONS'
    });
  }
  await course.deleteOne();
  if (actor) {
    await auditService.record(
      auditService.userEntry(actor, {
        action: AUDIT_ACTIONS.COURSE_REMOVED,
        after: { courseId: course._id, courseCode: course.courseCode }
      })
    );
  }
  return { id: course._id, courseCode: course.courseCode };
};

const getOne = async (user, id) => {
  const course = await getById(id);
  assertCanView(user, course);
  return withEnrolledCount(course);
};

/** Admin: provision a professor. Password arrives with their first course. */
const addProfessor = async (data, actor) => {
  const existing = await User.findOne({ email: data.email });
  if (existing) throw new AppError('An account with that email already exists', 409, { code: 'EMAIL_TAKEN' });
  const professor = await User.create({
    name: data.name,
    email: data.email,
    role: ROLES.PROFESSOR,
    passwordSetByCourse: null
  });
  if (actor) {
    await auditService.record(
      auditService.userEntry(actor, {
        action: AUDIT_ACTIONS.PROFESSOR_ADDED,
        after: { professorId: professor._id, email: professor.email }
      })
    );
  }
  return professor.toJSON();
};

module.exports = { getById, list, listAll, create, update, remove, getOne, addProfessor, ensureProfessorPassword, assertProfessor };
