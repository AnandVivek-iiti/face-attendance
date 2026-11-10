// Real Node -> real Python ML service round trip. SKIPPED (and reported as skipped) unless:
//   ML_LIVE_URL=http://127.0.0.1:8000  ML_LIVE_KEY=<API_KEY>  ML_LIVE_IMAGES=<dir made by make-fixtures.py>
// A single real face is available (fixtures: pasted copies of it), so this checks the contract and the safety policy, not recognition accuracy across people.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const live = process.env.ML_LIVE_URL && process.env.ML_LIVE_IMAGES;
const opts = { skip: live ? false : 'set ML_LIVE_URL, ML_LIVE_KEY, ML_LIVE_IMAGES to run' };

if (live) {
  process.env.JWT_SECRET = 'k'.repeat(40); process.env.MONGODB_URI = 'mongodb://x/y'; process.env.CLIENT_URL = 'http://localhost:5173';
  process.env.ML_SERVICE_URL = process.env.ML_LIVE_URL; process.env.ML_API_KEY = process.env.ML_LIVE_KEY; process.env.ML_TIMEOUT_MS = '120000';
}

const img = (name) => ({ buffer: fs.readFileSync(path.join(process.env.ML_LIVE_IMAGES || '.', name)), filename: name, mimeType: 'image/jpeg' });
const randomUnit = (dim, seed) => {
  let s = seed; const v = Array.from({ length: dim }, () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; });
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)); return v.map((x) => x / n);
};

test('live: full contract round trip through validateAnalysis and reconcile', opts, async (t) => {
  const ml = require('../../src/services/mlClient');
  const { validateAnalysis } = require('../../src/services/mlContract');
  const { reconcile } = require('../../src/services/reconciliationService');
  const env = require('../../src/config/env');
  const health = await ml.getHealth();
  const ref = await ml.generateEmbedding(img('reference.jpg'));
  assert.equal(ref.embeddingModel, health.embeddingModel);
  assert.equal(ref.embedding.length, health.embeddingDim);

  const students = [{ _id: 'a', studentId: 'S1' }, { _id: 'b', studentId: 'S2' }];
  const gallery = (withReal = true) => [
    ...(withReal ? [{ studentId: 'S1', embeddings: [ref.embedding] }] : [{ studentId: 'S1', embeddings: [randomUnit(512, 5)] }]),
    { studentId: 'S2', embeddings: [randomUnit(512, 9)] }
  ];
  const run = async (files, g) => {
    const raw = await ml.analyzeClassroom({ images: files.map(img), gallery: g, embeddingModel: health.embeddingModel });
    const checked = validateAnalysis(raw, {
      model: health.embeddingModel, dim: health.embeddingDim, galleryIds: g.map((x) => x.studentId), imageCount: files.length,
      floors: { minSimilarity: env.autoPresentMinSimilarity, minMargin: env.autoPresentMinMargin }
    });
    const rec = reconcile({ students, imageResults: [{ imageId: 'i', response: { faces: checked.faces } }] });
    return { raw, checked, rec };
  };
  const status = (rec, code) => rec.records.find((r) => r.studentCode === code).status;

  await t.test('registered student in a clear photo -> Present, with margin and reasons carried through', async () => {
    const { raw, rec } = await run(['class_same.jpg'], gallery());
    console.log('   clear photo:', raw.faces.map((f) => `${f.decision} sim=${f.similarity} margin=${f.matchMargin}`).join(' | '));
    assert.equal(status(rec, 'S1'), 'present');
    assert.equal(status(rec, 'S2'), 'absent');
  });
  await t.test('same face but the student is NOT in the gallery -> nobody is marked Present', async () => {
    const { raw, rec } = await run(['class_same.jpg'], gallery(false));
    console.log('   not enrolled:', raw.faces.map((f) => `${f.decision} sim=${f.similarity}`).join(' | '));
    assert.equal(rec.counts.presentCount, 0);
  });
  await t.test('very blurry / tiny face never becomes automatic Present', async () => {
    for (const f of ['class_blur.jpg', 'class_tiny.jpg']) {
      const { raw, rec } = await run([f], gallery());
      console.log(`   ${f}:`, raw.faces.map((x) => `${x.decision} sim=${x.similarity}`).join(' | ') || 'no faces');
      assert.notEqual(status(rec, 'S1'), 'present', f);
    }
  });
  await t.test('two identical faces compete for one student: neither is auto-Present, both go to review', async () => {
    const { raw, checked, rec } = await run(['class_two.jpg'], gallery());
    console.log('   two faces:', raw.faces.map((f) => `${f.decision} id=${f.studentId} sim=${f.similarity} margin=${f.matchMargin}`).join(' | '));
    assert.ok(checked.faces.filter((f) => f.studentId === 'S1').length <= 1);
    assert.equal(rec.counts.presentCount, 0);
    assert.equal(status(rec, 'S1'), 'needs_review');
  });
  await t.test('photo without a face -> no faces, nobody Present', async () => {
    const { raw, rec } = await run(['noface.jpg'], gallery());
    assert.equal(rec.counts.presentCount, 0);
    assert.equal(raw.faces.length, 0);
  });
  await t.test('wrong embeddingModel is refused by the ML service (409)', async () => {
    await assert.rejects(ml.analyzeClassroom({ images: [img('class_same.jpg')], gallery: gallery(), embeddingModel: 'some_other_model' }));
  });
});
