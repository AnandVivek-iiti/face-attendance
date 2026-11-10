// Course-wise visibility, run against an in-memory stand-in for the three models (no MongoDB is available here).
const test = require('node:test');
const assert = require('node:assert/strict');

const oid = (n) => ({ n, toString: () => n, equals(o) { return String(o) === n; } });
const prof = { A: oid('profA'), B: oid('profB') };
const courses = [
  { _id: oid('cA'), courseCode: 'CS201', professorId: prof.A, semester: 3 },
  { _id: oid('cB'), courseCode: 'CS202', professorId: prof.B, semester: 3 },
  { _id: oid('cA2'), courseCode: 'CS301', professorId: prof.A, semester: 3 }
];
// All five students are semester 3 (the old rule would have shown all five to both professors).
const enrollments = [
  { courseId: 'cA', studentId: 's1', active: true },
  { courseId: 'cA', studentId: 's2', active: true },
  { courseId: 'cA', studentId: 's3', active: false },
  { courseId: 'cA2', studentId: 's2', active: true },
  { courseId: 'cB', studentId: 's4', active: true },
  { courseId: 'cB', studentId: 's5', active: true }
];
const inSet = (set, v) => set.map(String).includes(String(v));

const Course = require('../src/models/Course');
const CourseEnrollment = require('../src/models/CourseEnrollment');
Course.distinct = async (field, filter = {}) =>
  courses
    .filter((c) => (!filter.professorId || String(c.professorId) === String(filter.professorId)) && (!filter.courseCode || c.courseCode === filter.courseCode))
    .map((c) => c[field]);
Course.findById = async (id) => courses.find((c) => String(c._id) === String(id)) || null;
CourseEnrollment.distinct = async (field, filter) =>
  [...new Set(enrollments.filter((e) =>
    (filter.active === undefined || e.active === filter.active) &&
    (!filter.courseId || (filter.courseId.$in ? inSet(filter.courseId.$in, e.courseId) : String(filter.courseId) === e.courseId))
  ).map((e) => e[field]))];
CourseEnrollment.exists = async (filter) =>
  enrollments.some((e) => e.active === filter.active && e.studentId === String(filter.studentId) && inSet(filter.courseId.$in, e.courseId)) || null;

const svc = require('../src/services/courseEnrollmentService');
const A = { _id: prof.A, role: 'professor' };
const B = { _id: prof.B, role: 'professor' };
const admin = { _id: oid('adm'), role: 'admin' };

test('professor scope is only their own courses, not the whole semester', async () => {
  const scope = await svc.resolveCourseScope(A, {});
  assert.deepEqual(scope.map(String).sort(), ['cA', 'cA2']);
  const ids = await svc.studentIdsInCourses(scope);
  assert.deepEqual(ids.sort(), ['s1', 's2']);
});

test("another professor's students are invisible", async () => {
  assert.deepEqual((await svc.studentIdsInCourses(await svc.resolveCourseScope(B, {}))).sort(), ['s4', 's5']);
  assert.equal(await svc.professorTeachesStudent(A, 's4'), false);
  assert.equal(await svc.professorTeachesStudent(B, 's4'), true);
});

test('a student who left the course (inactive) is not visible', async () => {
  assert.equal(await svc.professorTeachesStudent(A, 's3'), false);
});

test('a student in two of my courses is counted once', async () => {
  assert.equal((await svc.studentIdsInCourses(await svc.resolveCourseScope(A, {}))).filter((x) => x === 's2').length, 1);
});

test('filtering by course code stays inside the professor\'s own courses', async () => {
  assert.deepEqual((await svc.resolveCourseScope(A, { courseCode: 'cs201' })).map(String), ['cA']);
  assert.deepEqual(await svc.resolveCourseScope(A, { courseCode: 'CS202' }), []);
  assert.deepEqual((await svc.resolveCourseScope(admin, { courseCode: 'CS202' })).map(String), ['cB']);
});

test('an unknown course id is rejected', async () => {
  await assert.rejects(svc.resolveCourseScope(A, { courseId: 'a'.repeat(23) + '1' }), /Course not found|Invalid/);
});

test('admin with no filter has no course limit', async () => {
  assert.equal(await svc.resolveCourseScope(admin, {}), null);
});
