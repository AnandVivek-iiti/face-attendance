// Builds ML-service-shaped faces/responses for tests. Defaults describe a clean, confirmed match.
const face = (over = {}) => ({
  faceId: 'face_001', bbox: [0, 0, 80, 80], detectionConfidence: 0.99, faceQuality: 0.8, qualityTier: 'ok',
  studentId: 'S1', similarity: 0.72, secondBestSimilarity: 0.2, matchMargin: 0.5, decision: 'high_confidence',
  decisionDetail: { identityPassed: true, qualityPassed: true, imageStatus: 'good', reasons: [] },
  candidates: [], clusterId: null, ...over
});
const response = (faces, over = {}) => ({
  embeddingModel: 'buffalo_l', embeddingDim: 512, excludedStudents: [],
  policy: { version: 2, highConfidenceThreshold: 0.55, reviewThreshold: 0.4, minMatchMargin: 0.05, requireGoodImageForHigh: true },
  imageQuality: { status: 'good' }, imageQualities: [{ index: 0, status: 'good' }],
  faces,
  summary: {
    detectedFaces: faces.length,
    highConfidence: faces.filter((f) => f.decision === 'high_confidence').length,
    needsReview: faces.filter((f) => f.decision === 'needs_review').length,
    unknown: faces.filter((f) => f.decision === 'unknown').length
  },
  ...over
});
const expected = (over = {}) => ({
  model: 'buffalo_l', dim: 512, galleryIds: ['S1', 'S2', 'S3'], imageCount: 1,
  floors: { minSimilarity: 0.55, minMargin: 0.05 }, ...over
});
module.exports = { face, response, expected };
