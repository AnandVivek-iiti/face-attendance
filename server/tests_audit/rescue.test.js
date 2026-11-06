const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh } = require('./helpers');

test('legacy rescue pass stays inert: it never assigns a student to an unmatched face', () => {
  const { rescueUnmatchedFaces } = fresh('services/faceRescueService.js');
  const ref = Array.from({ length: 512 }, (_, i) => (i === 0 ? 1 : 0));
  const faces = [{ faceId: 'f1', decision: 'unknown', studentId: null, similarity: 0, embedding: ref }];
  assert.equal(rescueUnmatchedFaces(faces, [{ studentId: 'S1', faceEmbeddings: [ref] }]), 0);
  assert.equal(faces[0].studentId, null);
});
