const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'k'.repeat(40); process.env.MONGODB_URI = 'mongodb://x/y'; process.env.CLIENT_URL = 'http://localhost:5173'; process.env.ML_SERVICE_URL = 'http://x';
const { reconcile } = require('../src/services/reconciliationService');
const { validateAnalysis } = require('../src/services/mlContract');
const { face, response, expected } = require('./helpers');

const students = [{ _id: 'a', studentId: 'S1' }, { _id: 'b', studentId: 'S2' }, { _id: 'c', studentId: 'S3' }];
const through = (faces, respOver) => {
  const checked = validateAnalysis(response(faces, respOver), expected());
  return reconcile({ students, imageResults: [{ imageId: 'i1', response: { faces: checked.faces } }] });
};
const statusOf = (r, code) => r.records.find((x) => x.studentCode === code).status;

test('only a fully validated high-confidence match is Present', () => {
  const r = through([face({ studentId: 'S1' })]);
  assert.equal(statusOf(r, 'S1'), 'present');
  assert.equal(statusOf(r, 'S2'), 'absent');
});

test('REGRESSION: high_confidence with similarity 0.05 is no longer Present', () => {
  assert.equal(statusOf(through([face({ similarity: 0.05 })]), 'S1'), 'needs_review');
});

test('needs_review goes to the review queue, with evidence', () => {
  const r = through([face({ decision: 'needs_review', similarity: 0.5, matchMargin: 0.02 })]);
  assert.equal(statusOf(r, 'S1'), 'needs_review');
  assert.equal(r.records[0].evidence[0].matchMargin, 0.02);
});

test('unknown faces stay unassigned and nobody becomes Present', () => {
  const r = through([face({ studentId: null, decision: 'unknown', similarity: 0.1 })]);
  assert.equal(r.counts.presentCount, 0);
  assert.equal(r.unknownFaces.length, 1);
});

test('a contested review face without a studentId assigns nobody', () => {
  const r = through([face({ studentId: null, decision: 'needs_review', similarity: 0.45 })]);
  assert.equal(r.counts.presentCount + r.counts.needsReviewCount, 0);
  assert.equal(r.unknownFaces.length, 1);
});

test('two faces claiming one student (defence in depth) is never automatic', () => {
  const faces = [face({ faceId: 'img1_face_001' }), face({ faceId: 'img2_face_001' })];
  const r = reconcile({
    students,
    imageResults: [{ imageId: 'i1', response: { faces: [{ ...faces[0], decision: 'high_confidence' }] } }, { imageId: 'i2', response: { faces: [{ ...faces[1], decision: 'high_confidence' }] } }]
  });
  assert.equal(statusOf(r, 'S1'), 'needs_review');
});
