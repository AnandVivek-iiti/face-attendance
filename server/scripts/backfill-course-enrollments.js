#!/usr/bin/env node
// One-time backfill of CourseEnrollment from existing data. DRY RUN by default; nothing is written without --apply.
// Only ever inserts enrollments (idempotent upserts). It never deletes or edits students, records, sessions or embeddings.
//
//   node scripts/backfill-course-enrollments.js                       dry run, all courses
//   node scripts/backfill-course-enrollments.js --course CS201        limit to a course code (or a course _id)
//   node scripts/backfill-course-enrollments.js --legacy-cohort       also add the old semester/section roster for the selected courses
//   node scripts/backfill-course-enrollments.js --apply               write the planned enrollments
//   node scripts/backfill-course-enrollments.js --apply --drop-legacy-course-index
const db = require('../src/config/db');
const Course = require('../src/models/Course');
const Student = require('../src/models/Student');
const CourseEnrollment = require('../src/models/CourseEnrollment');
const EnrollmentRequest = require('../src/models/EnrollmentRequest');
const AttendanceSession = require('../src/models/AttendanceSession');
const AttendanceRecord = require('../src/models/AttendanceRecord');
const { planEnrollmentBackfill } = require('../src/utils/enrollmentBackfill');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};

const main = async () => {
  const apply = flag('--apply');
  const legacy = flag('--legacy-cohort');
  const only = option('--course');
  await db.connect();

  const courseFilter = only
    ? /^[0-9a-fA-F]{24}$/.test(only) ? { _id: only } : { courseCode: only.trim().toUpperCase() }
    : {};
  const courses = await Course.find(courseFilter).lean();
  if (courses.length === 0) throw new Error('No matching courses');
  const courseIds = courses.map((course) => course._id);
  const courseLabel = new Map(courses.map((c) => [String(c._id), `${c.courseCode}${c.section ? `-${c.section}` : ''}`]));

  const [approvedRequests, sessions, students, existingRows] = await Promise.all([
    EnrollmentRequest.find({ courseId: { $in: courseIds }, status: 'approved' }).select('courseId rollNumber').lean(),
    AttendanceSession.find({ courseId: { $in: courseIds } }).select('_id courseId').lean(),
    Student.find().select('_id rollNumber').lean(),
    CourseEnrollment.find({ courseId: { $in: courseIds } }).select('courseId studentId').lean()
  ]);
  const sessionCourse = new Map(sessions.map((s) => [String(s._id), String(s.courseId)]));
  const records = await AttendanceRecord.find({ sessionId: { $in: sessions.map((s) => s._id) } })
    .select('sessionId studentId status source reviewedByProfessor')
    .lean();

  const legacyCohorts = [];
  if (legacy) {
    for (const course of courses) {
      if (!course.section) continue;
      const cohort = await Student.find({ semester: course.semester, section: course.section, active: true }).select('_id').lean();
      legacyCohorts.push({ courseId: String(course._id), studentIds: cohort.map((s) => String(s._id)) });
    }
  }

  const plan = planEnrollmentBackfill({
    approvedRequests: approvedRequests.map((r) => ({ courseId: String(r.courseId), rollNumber: r.rollNumber })),
    sessionCourse,
    records,
    studentByRoll: new Map(students.map((s) => [s.rollNumber, String(s._id)])),
    existing: new Set(existingRows.map((r) => `${r.courseId}:${r.studentId}`)),
    legacyCohorts
  });

  const perCourse = new Map();
  for (const item of plan) {
    const label = courseLabel.get(item.courseId);
    const entry = perCourse.get(label) || { total: 0 };
    entry.total += 1;
    entry[item.reason] = (entry[item.reason] || 0) + 1;
    perCourse.set(label, entry);
  }
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${plan.length} enrollment(s) to add across ${perCourse.size} course(s); ${existingRows.length} already present`);
  for (const [label, entry] of perCourse) console.log(`  ${label}:`, JSON.stringify(entry));

  // Courses that would collide under the new (courseCode, section) identity.
  const seen = new Map();
  for (const course of await Course.find().select('courseCode section').lean()) {
    const key = `${course.courseCode}|${course.section || ''}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const clashes = [...seen].filter(([, n]) => n > 1);
  if (clashes.length) console.log('WARNING: duplicate (courseCode, section) pairs, merge or rename before the new unique index can build:', clashes.map(([k]) => k));

  if (!apply) {
    console.log('Nothing written. Review the numbers, then re-run with --apply.');
    return;
  }
  await CourseEnrollment.createIndexes();
  if (plan.length) {
    await CourseEnrollment.bulkWrite(
      plan.map((item) => ({
        updateOne: {
          filter: { courseId: item.courseId, studentId: item.studentId },
          update: { $setOnInsert: { active: true, source: 'migration', enrolledAt: new Date() } },
          upsert: true
        }
      })),
      { ordered: false }
    );
  }
  console.log('Enrollments written.');
  if (flag('--drop-legacy-course-index')) {
    try {
      await Course.collection.dropIndex('courseCode_1_semester_1_section_1');
      console.log('Dropped legacy index courseCode_1_semester_1_section_1');
    } catch (error) {
      console.log(`Legacy index not dropped: ${error.message}`);
    }
  }
};

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.disconnect());
