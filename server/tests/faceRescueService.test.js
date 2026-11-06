require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { rescueUnmatchedFaces } = require('../src/services/faceRescueService');
test('second-pass rescue never assigns an identity from cosine similarity alone', () => {
  const faces = [{ studentId: null, decision: 'unknown', embedding: [1, 0] }];
  const enrolled = [{ studentId: 'RITVICK', faceEmbeddings: [[0.41, 0.91]] }];
  assert.equal(rescueUnmatchedFaces(faces, enrolled), 0);
  assert.equal(faces[0].studentId, null);
  assert.equal(faces[0].decision, 'unknown');
});
