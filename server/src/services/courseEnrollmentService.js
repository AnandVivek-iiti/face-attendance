const Course = require('../models/Course');
const CourseEnrollment = require('../models/CourseEnrollment');
const Student = require('../models/Student');
const AppError = require('../utils/AppError');
const { toObjectId } = require('../utils/objectId');
const { ROLES } = require('../config/constants');

// Idempotent: enrolling twice is a no-op, and re-enrolling someone who left reactivates them.
const enroll = async (courseId, studentId, source = 'manual') => {
  try {
    await CourseEnrollment.updateOne(
      { courseId, studentId },
      { $set: { active: true }, $setOnInsert: { source, enrolledAt: new Date() } },
      { upsert: true }
    );
  } catch (error) {
    // Two concurrent upserts for the same pair: the other one won, which is the outcome we wanted.
    if (!(error && error.code === 11000)) throw error;
  }
};

const unenroll = (courseId, studentId) =>
  CourseEnrollment.updateOne({ courseId, studentId, active: true }, { $set: { active: false } });

const studentIdsInCourses = (courseIds) =>
  CourseEnrollment.distinct('studentId', { courseId: { $in: courseIds }, active: true });

const isEnrolled = async (courseId, studentId) =>
  Boolean(await CourseEnrollment.exists({ courseId, studentId, active: true }));

const courseIdsForStudent = (studentId) => CourseEnrollment.distinct('courseId', { studentId });

const countActive = async (courseId) => {
  const ids = await studentIdsInCourses([courseId]);
  if (ids.length === 0) return 0;
  return Student.countDocuments({ _id: { $in: ids }, active: true });
};

const listRoster = async (course, { withEmbeddings = false } = {}) => {
  const ids = await studentIdsInCourses([course._id]);
  if (ids.length === 0) return [];
  const query = Student.find({ _id: { $in: ids }, active: true }).sort({ rollNumber: 1 });
  if (withEmbeddings) query.select('+faceEmbeddings');
  return query.lean();
};

const professorCourseIds = (user) => Course.distinct('_id', { professorId: user._id });

// True when the student is enrolled in at least one course this professor teaches.
const professorTeachesStudent = async (user, studentId) => {
  const courseIds = await professorCourseIds(user);
  if (courseIds.length === 0) return false;
  return Boolean(await CourseEnrollment.exists({ courseId: { $in: courseIds }, studentId, active: true }));
};

const assertCourseAccess = (user, course) => {
  if (user.role === ROLES.ADMIN) return;
  if (user.role === ROLES.PROFESSOR && course.professorId.equals(user._id)) return;
  throw new AppError('You are not authorized for this course', 403, { code: 'FORBIDDEN' });
};

const loadCourse = async (user, id) => {
  const course = await Course.findById(toObjectId(id, 'course id'));
  if (!course) throw new AppError('Course not found', 404, { code: 'COURSE_NOT_FOUND' });
  assertCourseAccess(user, course);
  return course;
};

// Which courses a student list is limited to. null means "no course limit" (admin browsing everything).
const resolveCourseScope = async (user, { courseId, courseCode } = {}) => {
  if (courseId) return [(await loadCourse(user, courseId))._id];
  if (courseCode) {
    const filter = { courseCode: String(courseCode).trim().toUpperCase() };
    if (user.role === ROLES.PROFESSOR) filter.professorId = user._id;
    return Course.distinct('_id', filter);
  }
  if (user.role === ROLES.PROFESSOR) return professorCourseIds(user);
  return null;
};

// Course roster management by roll number; the response carries no student details.
const enrollByRollNumbers = async (user, courseId, rollNumbers, source = 'manual') => {
  const course = await loadCourse(user, courseId);
  const unique = [...new Set(rollNumbers.map((value) => String(value).trim()).filter(Boolean))];
  const students = await Student.find({ rollNumber: { $in: unique } }).select('_id rollNumber active').lean();
  const byRoll = new Map(students.map((student) => [student.rollNumber, student]));
  const enrolled = [];
  const inactive = [];
  const notFound = [];
  for (const roll of unique) {
    const student = byRoll.get(roll);
    if (!student) notFound.push(roll);
    else if (!student.active) inactive.push(roll);
    else {
      await enroll(course._id, student._id, source);
      enrolled.push(roll);
    }
  }
  return { courseId: course._id, enrolled, inactive, notFound };
};

const removeFromCourse = async (user, courseId, studentRef) => {
  const course = await loadCourse(user, courseId);
  const filter = /^[0-9a-fA-F]{24}$/.test(String(studentRef)) ? { _id: studentRef } : { studentId: String(studentRef) };
  const student = await Student.findOne(filter).select('_id studentId rollNumber').lean();
  if (!student || !(await isEnrolled(course._id, student._id))) {
    throw new AppError('That student is not enrolled in this course', 404, { code: 'STUDENT_NOT_IN_COURSE' });
  }
  await unenroll(course._id, student._id);
  return { courseId: course._id, studentId: student.studentId, rollNumber: student.rollNumber, removed: true };
};

const listCourseStudents = async (user, courseId) => {
  const course = await loadCourse(user, courseId);
  const roster = await listRoster(course);
  return roster.map((student) => {
    const { faceEmbeddings, __v, ...rest } = student;
    return rest;
  });
};

module.exports = {
  enroll,
  unenroll,
  isEnrolled,
  countActive,
  listRoster,
  studentIdsInCourses,
  courseIdsForStudent,
  professorCourseIds,
  professorTeachesStudent,
  resolveCourseScope,
  enrollByRollNumbers,
  removeFromCourse,
  listCourseStudents
};
