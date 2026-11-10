// Pure planning for the one-time CourseEnrollment backfill (no database access, so it is unit-testable).
//
// Before course-wise enrollment, every student matching a course's semester/section was on its roster, so the old data cannot say who
// really belongs to which course. Only positive evidence is used here:
//   - an approved enrollment request for that course,
//   - an attendance record that shows the student was actually seen or reviewed in a session of that course.
// A record that is merely the default "absent" for the whole cohort is NOT evidence.
const EVIDENCE_SOURCES = new Set(['manual', 'ai_reviewed']);

const isEvidence = (record) =>
  record.status === 'present' || record.reviewedByProfessor === true || EVIDENCE_SOURCES.has(record.source);

const planEnrollmentBackfill = ({
  approvedRequests = [],
  sessionCourse = new Map(),
  records = [],
  studentByRoll = new Map(),
  existing = new Set(),
  legacyCohorts = []
}) => {
  const planned = new Map();
  const add = (courseId, studentId, reason) => {
    const key = `${courseId}:${studentId}`;
    if (existing.has(key) || planned.has(key)) return;
    planned.set(key, { courseId: String(courseId), studentId: String(studentId), reason });
  };

  for (const request of approvedRequests) {
    const studentId = studentByRoll.get(request.rollNumber);
    if (studentId) add(request.courseId, studentId, 'approved_request');
  }
  for (const record of records) {
    const courseId = sessionCourse.get(String(record.sessionId));
    if (courseId && isEvidence(record)) add(courseId, record.studentId, 'attendance_evidence');
  }
  // Opt-in only: reproduces the old semester/section roster for the named courses.
  for (const cohort of legacyCohorts) {
    for (const studentId of cohort.studentIds) add(cohort.courseId, studentId, 'legacy_cohort');
  }
  return [...planned.values()];
};

module.exports = { planEnrollmentBackfill, isEvidence };
