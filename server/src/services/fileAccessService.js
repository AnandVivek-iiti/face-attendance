const AttendanceSession = require('../models/AttendanceSession');
const EnrollmentRequest = require('../models/EnrollmentRequest');
const Student = require('../models/Student');
const Course = require('../models/Course');
const { ROLES } = require('../config/constants');

// Stored names are always `<uuid>.<ext>` (optionally prefixed with an ObjectId),
// so anything outside this tiny alphabet is not one of ours and is refused
// before the filesystem is ever touched.
const IMAGE_EXT = '(?:jpg|png|webp)';
const PATTERNS = [
  { kind: 'attendance', regex: new RegExp(`^attendance-images/([0-9a-f]{24})/[A-Za-z0-9-]+\\.${IMAGE_EXT}$`) },
  { kind: 'registered', regex: new RegExp(`^registered-faces/([0-9a-f]{24})-[A-Za-z0-9-]+\\.${IMAGE_EXT}$`) },
  { kind: 'profile', regex: new RegExp(`^profile-images/([0-9a-f]{24})-[A-Za-z0-9-]+\\.${IMAGE_EXT}$`) }
];

/** Returns { kind, ownerId } for a well-formed storage path, otherwise null. */
const classify = (relativePath) => {
  if (typeof relativePath !== 'string' || relativePath.length > 200) return null;
  for (const { kind, regex } of PATTERNS) {
    const match = regex.exec(relativePath);
    if (match) return { kind, ownerId: match[1] };
  }
  return null;
};

/**
 * Photos of students are personal data, so being a professor is not enough:
 * the file has to belong to something that professor is responsible for.
 * Admins can see everything.
 */
const canAccess = async (user, relativePath, info = classify(relativePath)) => {
  if (!info) return false;
  if (user.role === ROLES.ADMIN) return true;
  if (user.role !== ROLES.PROFESSOR) return false;

  if (info.kind === 'attendance') {
    return Boolean(await AttendanceSession.exists({ _id: info.ownerId, professorId: user._id }));
  }

  if (info.kind === 'profile') {
    const request = await EnrollmentRequest.findOne({ imagePath: relativePath }).select('courseId').lean();
    if (!request) return false;
    return Boolean(await Course.exists({ _id: request.courseId, professorId: user._id }));
  }

  // registered-faces: visible to professors who teach the student's cohort.
  const student = await Student.findOne({ _id: info.ownerId, registeredImage: relativePath })
    .select('semester section')
    .lean();
  if (!student) return false;
  return Boolean(
    await Course.exists({ professorId: user._id, semester: student.semester, section: student.section })
  );
};

module.exports = { classify, canAccess };
