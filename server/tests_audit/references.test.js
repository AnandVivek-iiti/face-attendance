const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh } = require('./helpers');
const { nextReferences, MAX_REFERENCE_EMBEDDINGS } = fresh('utils/referenceEmbeddings.js');
const vec = (i) => Array.from({ length: 8 }, (_, k) => (k === i % 8 ? 1 : 0.01 * (i + 1)));

test('cap keeps the enrolment (first) reference', () => {
  let refs = [];
  for (let i = 0; i < MAX_REFERENCE_EMBEDDINGS + 3; i += 1) refs = nextReferences(refs, vec(i));
  assert.equal(refs.length, MAX_REFERENCE_EMBEDDINGS);
  assert.deepEqual(refs[0], vec(0));
});

test('near-duplicate capture is not stored again', () => {
  const refs = nextReferences([vec(0)], vec(0).map((x) => x * 1.0001));
  assert.equal(refs.length, 1);
});
