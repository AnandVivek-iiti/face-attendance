const test = require('node:test');
const assert = require('node:assert/strict');
const { stubs, fresh } = require('./helpers');

const make = ({ faces, records }) => {
  const session = { _id: 's1', status: 'review', totalStudents: records.length, analysis: { faces } };
  stubs['/AttendanceSession'] = {
    findOneAndUpdate: async () => ({ ...session, status: 'finalized' }), updateOne: async () => ({})
  };
  stubs['/AttendanceRecord'] = { find: () => ({ populate: () => ({ select: () => ({ lean: async () => records }) }) }) };
  stubs['/auditService'] = { record: async () => {}, userEntry: (u, e) => e };
  stubs['/recordService'] = { tally: async () => ({ presentCount: records.length, absentCount: 0, needsReviewCount: 0, totalStudents: records.length }) };
  stubs['/sessionService'] = { getOwnedSession: async () => session, assertNotFinalized: () => {}, buildReview: async () => ({ ok: true }) };
  return fresh('services/finalizationService.js');
};
const rec = [{ status: 'present', studentId: { studentId: 'S1' } }];

test('finalizing with unmatched faces requires an explicit acknowledgement', async () => {
  const svc = make({ faces: [{ faceId: 'a', studentId: 'S1' }, { faceId: 'b', studentId: null }], records: rec });
  await assert.rejects(() => svc.finalizeSession('s1', { _id: 'u' }), (e) => e.code === 'UNRESOLVED_FACES' || e.details?.code === 'UNRESOLVED_FACES');
});

test('acknowledged finalize succeeds', async () => {
  const svc = make({ faces: [{ faceId: 'b', studentId: null }], records: rec });
  assert.deepEqual(await svc.finalizeSession('s1', { _id: 'u' }, { acknowledgeUnresolved: true }), { ok: true });
});

test('records still needing review block finalize', async () => {
  const svc = make({ faces: [], records: [{ status: 'needs_review', studentId: { studentId: 'S1' } }] });
  await assert.rejects(() => svc.finalizeSession('s1', { _id: 'u' }));
});
