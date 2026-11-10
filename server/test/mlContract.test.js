const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAnalysis } = require('../src/services/mlContract');
const { face, response, expected } = require('./helpers');

const run = (faces, respOver, expOver) => validateAnalysis(response(faces, respOver), expected(expOver));
const rejects = (fn, reason) =>
  assert.throws(fn, (e) => e.code === 'ML_INVALID_RESPONSE' && e.statusCode === 502 && e.details.reason === reason);

test('a clean high-confidence match stays high-confidence', () => {
  const out = run([face()]);
  assert.equal(out.faces[0].decision, 'high_confidence');
  assert.equal(out.downgraded, 0);
});

test('high_confidence with similarity under the Node floor is downgraded to review, not Present', () => {
  const out = run([face({ similarity: 0.05, matchMargin: 0.5 })]);
  assert.equal(out.faces[0].decision, 'needs_review');
  assert.equal(out.faces[0].mlDecision, 'high_confidence');
  assert.ok(out.faces[0].contractReasons.includes('node_similarity_below_floor'));
  assert.equal(out.downgraded, 1);
});

test('the stricter of the Node floor and the ML policy applies', () => {
  const strictPolicy = { policy: { version: 2, highConfidenceThreshold: 0.8, minMatchMargin: 0.2, requireGoodImageForHigh: true } };
  assert.equal(run([face({ similarity: 0.7 })], strictPolicy).faces[0].decision, 'needs_review');
  assert.equal(run([face({ similarity: 0.9, matchMargin: 0.1 })], strictPolicy).faces[0].decision, 'needs_review');
  assert.equal(run([face({ similarity: 0.9, matchMargin: 0.3 })], strictPolicy).faces[0].decision, 'high_confidence');
});

test('small margin between first and second candidate is downgraded', () => {
  const out = run([face({ matchMargin: 0.01 })]);
  assert.equal(out.faces[0].decision, 'needs_review');
  assert.ok(out.faces[0].contractReasons.includes('node_margin_below_floor'));
});

test('a failed ML quality or identity gate downgrades even with a high score', () => {
  const bad = face({ decisionDetail: { identityPassed: true, qualityPassed: false, imageStatus: 'good', reasons: [{ code: 'face_soft', gate: 'quality' }] } });
  const out = run([bad]);
  assert.equal(out.faces[0].decision, 'needs_review');
  assert.ok(out.faces[0].reasonCodes.includes('face_soft'));
});

test('missing decisionDetail or non-ok face tier downgrades', () => {
  assert.equal(run([face({ decisionDetail: null })]).faces[0].decision, 'needs_review');
  assert.equal(run([face({ qualityTier: 'low' })]).faces[0].decision, 'needs_review');
});

test('poor or unusable photo prevents automatic confirmation when policy requires a good image', () => {
  const poor = { imageQualities: [{ index: 0, status: 'poor' }], imageQuality: { status: 'poor' } };
  assert.equal(run([face()], poor).faces[0].decision, 'needs_review');
  const lenient = { ...poor, policy: { version: 2, highConfidenceThreshold: 0.55, minMatchMargin: 0.05, requireGoodImageForHigh: false } };
  assert.equal(run([face()], lenient).faces[0].decision, 'high_confidence');
  const unusable = { imageQualities: [{ index: 0, status: 'unusable' }], imageQuality: { status: 'unusable' }, policy: lenient.policy };
  assert.equal(run([face()], unusable).faces[0].decision, 'needs_review');
});

test('NaN similarity can never pass', () => {
  const out = validateAnalysis({ ...response([face()]), faces: [face({ similarity: NaN })], summary: undefined }, expected());
  assert.equal(out.faces[0].decision, 'needs_review');
});

test('review and unknown pass through unchanged (never upgraded)', () => {
  const out = run([
    face({ faceId: 'face_001', decision: 'needs_review', similarity: 0.95, matchMargin: 0.9 }),
    face({ faceId: 'face_002', studentId: null, decision: 'unknown', similarity: 0.99 })
  ]);
  assert.deepEqual(out.faces.map((f) => f.decision), ['needs_review', 'unknown']);
});

test('legacy medium_confidence is treated as review', () => {
  assert.equal(run([face({ decision: 'medium_confidence' })], { summary: undefined }).faces[0].decision, 'needs_review');
});

test('model mismatch rejects the whole response', () => {
  rejects(() => run([face()], { embeddingModel: 'other_model' }), 'model_mismatch');
  rejects(() => run([face()], { embeddingDim: 128 }), 'dimension_mismatch');
});

test('a student that was not sent in the gallery rejects the response', () => {
  rejects(() => run([face({ studentId: 'GHOST' })]), 'student_not_in_gallery');
});

test('one student claimed by two faces rejects the response', () => {
  rejects(() => run([face({ faceId: 'face_001' }), face({ faceId: 'face_002' })]), 'student_claimed_twice');
});

test('duplicate faceId, bad image index, and summary mismatch reject', () => {
  rejects(() => run([face({ studentId: 'S1' }), face({ studentId: 'S2' })]), 'duplicate_face_id');
  rejects(() => run([face({ faceId: 'img3_face_001' })]), 'face_image_index');
  rejects(() => run([face()], { summary: { detectedFaces: 5, highConfidence: 1, needsReview: 0, unknown: 0 } }), 'summary_mismatch');
});

test('empty gallery: only unknown faces are legitimate', () => {
  const out = run([face({ studentId: null, decision: 'unknown', similarity: 0 })], {}, { galleryIds: [] });
  assert.equal(out.faces[0].decision, 'unknown');
  rejects(() => run([face()], {}, { galleryIds: [] }), 'student_not_in_gallery');
});
