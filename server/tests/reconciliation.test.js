require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcile } = require('../src/services/reconciliationService');

const students = ['A', 'B', 'C', 'D'].map((code) => ({ _id: `id-${code}`, studentId: code }));

const face = (faceId, studentId, similarity, decision, extra = {}) => ({
  faceId,
  bbox: [1, 2, 3, 4],
  detectionConfidence: 0.99,
  faceQuality: 0.9,
  studentId,
  similarity,
  decision,
  ...extra
});

const result = (faces) => ({ imageQuality: { status: 'good' }, faces });

const byCode = (outcome, code) => outcome.records.find((record) => record.studentCode === code);

test('high confidence is present, medium needs review, undetected is absent', () => {
  const outcome = reconcile({
    students,
    imageResults: [
      { imageId: 'img1', response: result([face('f1', 'A', 0.95, 'high_confidence'), face('f2', 'B', 0.6, 'needs_review')]) }
    ]
  });
  assert.equal(byCode(outcome, 'A').status, 'present');
  assert.equal(byCode(outcome, 'B').status, 'needs_review');
  assert.equal(byCode(outcome, 'C').status, 'absent');
  assert.equal(byCode(outcome, 'C').decision, 'not_detected');
  assert.deepEqual(outcome.counts, { totalStudents: 4, presentCount: 1, absentCount: 2, needsReviewCount: 1 });
});

test('same student across photos yields one record with all evidence', () => {
  const outcome = reconcile({
    students,
    imageResults: [
      { imageId: 'img1', response: result([face('f1', 'A', 0.7, 'needs_review')]) },
      { imageId: 'img2', response: result([face('f9', 'A', 0.96, 'high_confidence')]) }
    ]
  });
  const records = outcome.records.filter((record) => record.studentCode === 'A');
  assert.equal(records.length, 1);
  assert.equal(records[0].status, 'present');
  assert.equal(records[0].confidence, 0.96);
  assert.equal(records[0].evidence.length, 2);
  assert.equal(records[0].evidence[0].imageId, 'img2');
  assert.equal(outcome.counts.presentCount, 1);
});

test('unknown faces are never assigned to a student', () => {
  const outcome = reconcile({
    students,
    imageResults: [{ imageId: 'img1', response: result([face('f1', null, null, 'unknown')]) }]
  });
  assert.equal(outcome.unknownFaces.length, 1);
  assert.equal(outcome.counts.absentCount, 4);
});

test('predictions for non-enrolled students are kept out of records', () => {
  const outcome = reconcile({
    students,
    imageResults: [{ imageId: 'img1', response: result([face('f1', 'Z', 0.99, 'high_confidence')]) }]
  });
  assert.equal(outcome.unassignedFaces.length, 1);
  assert.equal(outcome.unassignedFaces[0].reason, 'not_enrolled');
  assert.equal(outcome.records.length, 4);
});
