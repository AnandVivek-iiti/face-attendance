const test = require('node:test');
const assert = require('node:assert/strict');
const { decideAssignmentEmbedding: decide } = require('../src/utils/referenceEmbeddings');

const base = { assignedStudentId: 'S1', sessionModel: 'buffalo_l', optIn: false, minSimilarity: 0.55 };
const ref = [[0.1]];

test('a student with no reference vector gets one (bootstrap)', () => {
  const d = decide({ ...base, student: { embeddingModel: null, faceEmbeddings: [], hasRegisteredPhoto: false }, face: { studentId: null, similarity: null } });
  assert.deepEqual(d, { action: 'append', reason: 'bootstrap' });
});

test('with usable references and opt-in OFF, nothing is added', () => {
  const d = decide({ ...base, student: { embeddingModel: 'buffalo_l', faceEmbeddings: ref, hasRegisteredPhoto: true }, face: { studentId: 'S1', similarity: 0.9 } });
  assert.equal(d.action, 'skip');
});

test('opt-in ON still refuses a face the ML service suggested for someone else (professor correction)', () => {
  const d = decide({ ...base, optIn: true, student: { embeddingModel: 'buffalo_l', faceEmbeddings: ref, hasRegisteredPhoto: true }, face: { studentId: 'S2', similarity: 0.9 } });
  assert.equal(d.reason, 'not_ml_suggested');
});

test('opt-in ON refuses a weak match and accepts a strong confirmed one', () => {
  const student = { embeddingModel: 'buffalo_l', faceEmbeddings: ref, hasRegisteredPhoto: true };
  assert.equal(decide({ ...base, optIn: true, student, face: { studentId: 'S1', similarity: 0.4 } }).action, 'skip');
  assert.equal(decide({ ...base, optIn: true, student, face: { studentId: 'S1', similarity: 0.7 } }).action, 'append');
});

test('old-model vectors are not replaced by a classroom crop when a registered photo can rebuild them', () => {
  const d = decide({ ...base, student: { embeddingModel: 'old', faceEmbeddings: ref, hasRegisteredPhoto: true }, face: { studentId: 'S1', similarity: 0.9 } });
  assert.equal(d.reason, 'rebuild_from_photo');
  const noPhoto = decide({ ...base, student: { embeddingModel: 'old', faceEmbeddings: ref, hasRegisteredPhoto: false }, face: { studentId: 'S1', similarity: 0.9 } });
  assert.equal(noPhoto.action, 'append');
});
