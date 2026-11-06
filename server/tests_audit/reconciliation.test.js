const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh } = require('./helpers');
const { reconcile } = fresh('services/reconciliationService.js');

const students = Array.from({ length: 50 }, (_, i) => ({ _id: `id${i}`, studentId: `S${i}` }));
const face = (faceId, studentId, similarity, decision, extra = {}) => ({
  faceId, bbox: [0, 0, 50, 50], studentId, similarity, decision, faceQuality: 0.7, detectionConfidence: 0.9, ...extra
});
const run = (faces) => reconcile({ students, imageResults: [{ imageId: 'img0', response: { faces } }] });
const rec = (out, code) => out.records.find((r) => r.studentCode === code);

test('HIGH match => present', () => assert.equal(rec(run([face('f1', 'S1', 0.7, 'high_confidence')]), 'S1').status, 'present'));
test('REVIEW match => needs_review, never auto-present', () => assert.equal(rec(run([face('f1', 'S2', 0.45, 'needs_review')]), 'S2').status, 'needs_review'));
test('unmatched face never creates or changes a roster student', () => {
  const out = run([face('f1', null, 0.1, 'unknown')]);
  assert.equal(out.records.length, 50); assert.equal(out.unknownFaces.length, 1); assert.equal(out.counts.presentCount, 0);
});
test('match to a student outside the roster is reported separately', () => {
  const out = run([face('f1', 'OTHER', 0.8, 'high_confidence')]);
  assert.equal(out.unassignedFaces.length, 1); assert.equal(out.counts.presentCount, 0);
});
test('one student in two photos yields one record', () => {
  const out = reconcile({ students, imageResults: [
    { imageId: 'a', response: { faces: [face('f1', 'S3', 0.8, 'high_confidence')] } },
    { imageId: 'b', response: { faces: [face('g1', 'S3', 0.7, 'high_confidence')] } }] });
  assert.equal(out.records.filter((r) => r.studentCode === 'S3').length, 1); assert.equal(out.counts.presentCount, 1);
});
test('present + absent + needsReview equals roster size', () => {
  const c = run([face('a', 'S1', 0.8, 'high_confidence'), face('b', 'S2', 0.45, 'needs_review'), face('c', null, 0, 'unknown')]).counts;
  assert.equal(c.presentCount + c.absentCount + c.needsReviewCount, c.totalStudents); assert.equal(c.totalStudents, 50);
});
test('student with no matching face is absent', () => assert.equal(rec(run([]), 'S9').status, 'absent'));
test('unknown sightings of one person count once (cluster)', () => {
  const out = run([face('a', null, 0, 'unknown', { clusterId: 'u1' }), face('b', null, 0, 'unknown', { clusterId: 'u1' }), face('c', null, 0, 'unknown', { clusterId: 'u2' })]);
  assert.equal(out.unknownFaces.length, 3); assert.equal(out.unknownClusterCount, 2);
});
