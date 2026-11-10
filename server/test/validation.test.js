const test = require('node:test');
const assert = require('node:assert/strict');
const schemas = require('../src/utils/validation');

const student = { studentId: 'S1', rollNumber: 'R1', name: 'A', department: 'CSE', semester: 3 };

test('section is optional when creating a student', () => {
  assert.equal(schemas.createStudent.safeParse(student).success, true);
  assert.equal(schemas.createStudent.safeParse({ ...student, section: 'a' }).data.section, 'A');
});

test('section is optional when creating a course', () => {
  const course = { courseCode: 'cs201', courseName: 'DS', professorId: 'a'.repeat(24), semester: 3 };
  assert.equal(schemas.createCourse.safeParse(course).success, true);
});

test('student list can be limited by course id or course code', () => {
  assert.equal(schemas.listStudents.safeParse({ courseId: 'a'.repeat(24) }).success, true);
  assert.equal(schemas.listStudents.safeParse({ courseCode: 'CS201' }).success, true);
  assert.equal(schemas.listStudents.safeParse({ courseId: 'nope' }).success, false);
});

test('enrollStudents needs at least one roll number', () => {
  assert.equal(schemas.enrollStudents.safeParse({ rollNumbers: [] }).success, false);
  assert.equal(schemas.enrollStudents.safeParse({ rollNumbers: ['R1'] }).success, true);
});
