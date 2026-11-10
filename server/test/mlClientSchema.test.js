// Drives mlClient against a stub HTTP server to prove malformed ML responses are refused at the boundary.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { face, response } = require('./helpers');

process.env.JWT_SECRET = 'k'.repeat(40);
process.env.MONGODB_URI = 'mongodb://x/y';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.ML_API_KEY = 'test';
process.env.ML_RETRY_ATTEMPTS = '1';

const serve = (body) =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => { req.resume(); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); });
    server.listen(0, () => resolve(server));
  });

const call = async (body) => {
  const server = await serve(body);
  process.env.ML_SERVICE_URL = `http://127.0.0.1:${server.address().port}`;
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/services/mlClient')];
  const ml = require('../src/services/mlClient');
  try {
    return await ml.analyzeClassroom({ images: [{ buffer: Buffer.from('x'), filename: 'a.jpg', mimeType: 'image/jpeg' }], gallery: [], embeddingModel: 'buffalo_l' });
  } finally {
    server.close();
  }
};

test('a valid response keeps margin, second best, policy and reasons', async () => {
  const out = await call(response([face()]));
  assert.equal(out.faces[0].matchMargin, 0.5);
  assert.equal(out.faces[0].secondBestSimilarity, 0.2);
  assert.equal(out.embeddingModel, 'buffalo_l');
  assert.equal(out.policy.highConfidenceThreshold, 0.55);
});

test('out-of-range similarity is refused', async () => {
  await assert.rejects(call(response([face({ similarity: 7.5 })])));
});

test('an unknown face that names a student is refused', async () => {
  await assert.rejects(call(response([face({ decision: 'unknown', studentId: 'S1' })])));
});

test('a response without embeddingModel is refused', async () => {
  const body = response([face()]);
  delete body.embeddingModel;
  await assert.rejects(call(body));
});
