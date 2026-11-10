const test = require('node:test');
const assert = require('node:assert/strict');
const { planEnrollmentBackfill } = require('../src/utils/enrollmentBackfill');

const base = () => ({
  sessionCourse: new Map([['sess1', 'cX']]),
  studentByRoll: new Map([['R1', 's1'], ['R2', 's2']])
});

test('approved request enrolls that student in that course only', () => {
  const plan = planEnrollmentBackfill({ ...base(), approvedRequests: [{ courseId: 'cX', rollNumber: 'R1' }] });
  assert.deepEqual(plan, [{ courseId: 'cX', studentId: 's1', reason: 'approved_request' }]);
});

test('default-absent records for the whole cohort are not evidence', () => {
  const records = [
    { sessionId: 'sess1', studentId: 's1', status: 'absent', source: 'ai', reviewedByProfessor: false },
    { sessionId: 'sess1', studentId: 's2', status: 'present', source: 'ai', reviewedByProfessor: false }
  ];
  const plan = planEnrollmentBackfill({ ...base(), records });
  assert.deepEqual(plan.map((p) => p.studentId), ['s2']);
});

test('a professor-reviewed or manual record counts even when marked absent', () => {
  const records = [{ sessionId: 'sess1', studentId: 's1', status: 'absent', source: 'manual', reviewedByProfessor: true }];
  assert.equal(planEnrollmentBackfill({ ...base(), records }).length, 1);
});

test('existing enrollments and duplicate evidence are not planned twice', () => {
  const records = [
    { sessionId: 'sess1', studentId: 's1', status: 'present' },
    { sessionId: 'sess1', studentId: 's2', status: 'present' }
  ];
  const plan = planEnrollmentBackfill({
    ...base(),
    approvedRequests: [{ courseId: 'cX', rollNumber: 'R1' }],
    records,
    existing: new Set(['cX:s2'])
  });
  assert.deepEqual(plan.map((p) => p.studentId), ['s1']);
});

test('records from sessions outside the selected courses are ignored', () => {
  const plan = planEnrollmentBackfill({ ...base(), records: [{ sessionId: 'other', studentId: 's1', status: 'present' }] });
  assert.equal(plan.length, 0);
});

test('legacy cohort is applied only when supplied', () => {
  assert.equal(planEnrollmentBackfill({ ...base() }).length, 0);
  const plan = planEnrollmentBackfill({ ...base(), legacyCohorts: [{ courseId: 'cX', studentIds: ['s1', 's2'] }] });
  assert.equal(plan.length, 2);
});
