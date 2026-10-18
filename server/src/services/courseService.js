const Course = require('../models/Course');
const User = require('../models/User');
const Student = require('../models/Student');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');
const authService = require('./authService');
const emailService = require('./emailService');
const { toObjectId } = require('../utils/objectId');
const AttendanceSession = require('../models/AttendanceSession');
const { ROLES, AUDIT_ACTIONS } = require('../config/constants');

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

const withEnrolledCount = async (course, { includeProfessorEmail = true } = {}) => {
  const [enrolledCount, professor] = await Promise.all([
    Student.countDocuments({
      semester: course.semester,
      section: course.section,
      active: true
    }),
    course.professorId ? User.findById(course.professorId).select('name email').lean() : null
  ]);
  return {
    ...course.toJSON(),
    // The client shows the assigned professor's name; the raw doc only has the id.
    professorName: professor?.name ?? null,
    // Staff contact details are not for students to harvest.
    professorEmail: includeProfessorEmail ? professor?.email ?? null : null,
    enrolledCount
  };
};

const list = async (user) => {
  const filter =
    user.role === ROLES.ADMIN ? {} : user.role === ROLES.PROFESSOR ? { professorId: user._id } : { _id: null };
  const courses = await Course.find(filter).sort({ courseCode: 1, section: 1 });
  return Promise.all(courses.map(withEnrolledCount));
};

// Every course, for students picking one to enroll in.
const listAll = async (user) => {
  const includeProfessorEmail = Boolean(user) && user.role !== ROLES.STUDENT;
  const courses = await Course.find().sort({ courseCode: 1, section: 1 });
  return Promise.all(courses.map((course) => withEnrolledCount(course, { includeProfessorEmail })));
};

const assertProfessor = async (professorId) => {
  const professor = await User.findOne({ _id: professorId, role: ROLES.PROFESSOR }).select('_id email');
  if (!professor) throw new AppError('professorId does not belong to a professor', 400, { code: 'INVALID_PROFESSOR' });
  return professor;
};

// A professor's login password is no longer derived from a course code.
const create = async (data, actor) => {
  await assertProfessor(data.professorId);
  const course = await Course.create(data);

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
  if (data.professorId !== undefined) await assertProfessor(data.professorId);
  course.set(data);
  await course.save();

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

// Admin: list provisioned professors so courses can be assigned to one.
const listProfessors = async () => {
  const professors = await User.find({ role: ROLES.PROFESSOR })
    .select('name email department emailVerified createdAt')
    .sort({ name: 1 });
  return professors.map((professor) => professor.toJSON());
};

// One-time link issuance + email delivery, shared by the three admin actions.
const emailInvite = (professor, link, password) =>
  emailService.sendProfessorInvite({ to: professor.email, name: professor.name, link, password });
const emailMagicLink = (professor, link) =>
  emailService.sendMagicLink({ to: professor.email, name: professor.name, link });

// Admin provisions a professor.
const addProfessor = async (data, actor) => {
  const existing = await User.findOne({ email: data.email });
  if (existing) throw new AppError('An account with that email already exists', 409, { code: 'EMAIL_TAKEN' });

  const temporaryPassword = authService.generateTemporaryPassword();
  const professor = new User({
    name: data.name,
    email: data.email,
    role: ROLES.PROFESSOR,
    department: data.department ?? null,
    passwordHash: await authService.hashPassword(temporaryPassword),
    mustChangePassword: true,
    emailVerified: false
  });

  let link;
  try {
    // Persists the professor and their verification token in one save.
    ({ link } = await authService.issueEmailVerification(professor));
  } catch (error) {
    if (error && error.code === 11000) {
      throw new AppError('An account with that email already exists', 409, { code: 'EMAIL_TAKEN' });
    }
    throw error;
  }
  const emailDelivered = await emailInvite(professor, link, temporaryPassword);

  if (actor) {
    await auditService.record(
      auditService.userEntry(actor, {
        action: AUDIT_ACTIONS.PROFESSOR_ADDED,
        after: { professorId: professor._id, email: professor.email }
      })
    );
  }
  return { ...professor.toJSON(), temporaryPassword, inviteLink: link, emailDelivered };
};

// Admin: resend the professor's sign-in link (does not change the password).
const inviteProfessor = async (id, actor) => {
  const professor = await User.findOne({ _id: toObjectId(id, 'professor id'), role: ROLES.PROFESSOR });
  if (!professor) throw new AppError('Professor not found', 404, { code: 'PROFESSOR_NOT_FOUND' });
  const { link } = await authService.issueEmailVerification(professor);
  const emailDelivered = await emailMagicLink(professor, link);
  if (actor) {
    await auditService.record(
      auditService.userEntry(actor, {
        action: AUDIT_ACTIONS.PROFESSOR_INVITED,
        after: { professorId: professor._id, email: professor.email }
      })
    );
  }
  return { professor: professor.toJSON(), inviteLink: link, emailDelivered };
};

// Admin: regenerate BOTH a random password and a fresh sign-in link.
const regenerateProfessorCredentials = async (id, actor) => {
  const professor = await User.findOne({ _id: toObjectId(id, 'professor id'), role: ROLES.PROFESSOR });
  if (!professor) throw new AppError('Professor not found', 404, { code: 'PROFESSOR_NOT_FOUND' });

  const temporaryPassword = authService.generateTemporaryPassword();
  professor.passwordHash = await authService.hashPassword(temporaryPassword);
  professor.mustChangePassword = true;
  // Revoke any token issued before this reset.
  professor.passwordChangedAt = new Date();
  const { link } = await authService.issueEmailVerification(professor);
  const emailDelivered = await emailInvite(professor, link, temporaryPassword);

  if (actor) {
    await auditService.record(
      auditService.userEntry(actor, {
        action: AUDIT_ACTIONS.PROFESSOR_CREDENTIALS_REGENERATED,
        after: { professorId: professor._id, email: professor.email }
      })
    );
  }
  return { professor: professor.toJSON(), temporaryPassword, inviteLink: link, emailDelivered };
};

const updateProfessor = async (id, data, actor) => {
  const professor = await User.findOne({ _id: toObjectId(id, 'professor id'), role: ROLES.PROFESSOR });
  if (!professor) throw new AppError('Professor not found', 404, { code: 'PROFESSOR_NOT_FOUND' });
  professor.set(data);
  await professor.save();
  if (actor) {
    await auditService.record(
      auditService.userEntry(actor, {
        action: AUDIT_ACTIONS.PROFESSOR_UPDATED,
        after: { professorId: professor._id, changes: Object.keys(data) }
      })
    );
  }
  return professor.toJSON();
};

const removeProfessor = async (id, actor) => {
  const professor = await User.findOne({ _id: toObjectId(id, 'professor id'), role: ROLES.PROFESSOR });
  if (!professor) throw new AppError('Professor not found', 404, { code: 'PROFESSOR_NOT_FOUND' });
  const courseCount = await Course.countDocuments({ professorId: professor._id });
  if (courseCount > 0) {
    throw new AppError('A professor with assigned courses cannot be removed', 409, { code: 'PROFESSOR_HAS_COURSES' });
  }
  await professor.deleteOne();
  if (actor) {
    await auditService.record(
      auditService.userEntry(actor, {
        action: AUDIT_ACTIONS.PROFESSOR_REMOVED,
        after: { professorId: professor._id, email: professor.email }
      })
    );
  }
  return { id: professor._id, email: professor.email };
};

module.exports = {
  getById,
  list,
  listAll,
  create,
  update,
  remove,
  getOne,
  listProfessors,
  addProfessor,
  updateProfessor,
  removeProfessor,
  inviteProfessor,
  regenerateProfessorCredentials,
  assertProfessor
};
