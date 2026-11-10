// The single authority on whether an ML analysis result may be trusted.
//
// The Python service decides identity (similarity, margin, quality). Node never turns a weaker ML decision into a stronger one;
// it can only confirm or DOWNGRADE:
//   structurally invalid response        -> rejected outright (ML_INVALID_RESPONSE), nothing is stored
//   "high_confidence" that fails a check -> becomes "needs_review" with explicit reason codes
//   "needs_review" / "unknown"           -> passed through unchanged
const AppError = require('../utils/AppError');
const { ML_DECISION } = require('../config/constants');

const invalid = (code, message) => new AppError(`Invalid ML service response: ${message}`, 502, { code: 'ML_INVALID_RESPONSE', details: { reason: code } });

const reasonCodesOf = (face) => ((face.decisionDetail && face.decisionDetail.reasons) || []).map((reason) => reason.code);

// Why a "high_confidence" face is not allowed to become Present automatically. Empty array = it may.
const highConfidenceFailures = (face, { policy, floors, imageStatus }) => {
  const failures = [];
  const minSimilarity = Math.max(floors.minSimilarity, policy && Number.isFinite(policy.highConfidenceThreshold) ? policy.highConfidenceThreshold : 0);
  const minMargin = Math.max(floors.minMargin, policy && Number.isFinite(policy.minMatchMargin) ? policy.minMatchMargin : 0);

  // Written as `!(x >= limit)` so a NaN can never pass.
  if (!(face.similarity >= minSimilarity)) failures.push('node_similarity_below_floor');
  if (!(face.matchMargin >= minMargin)) failures.push('node_margin_below_floor');
  if (!face.decisionDetail) failures.push('node_missing_decision_detail');
  else {
    if (face.decisionDetail.identityPassed !== true) failures.push('node_identity_gate_not_passed');
    if (face.decisionDetail.qualityPassed !== true) failures.push('node_quality_gate_not_passed');
  }
  if (face.qualityTier !== 'ok') failures.push('node_face_quality_not_ok');
  if (imageStatus === 'unusable') failures.push('node_image_unusable');
  else if (!policy || policy.requireGoodImageForHigh !== false) {
    if (imageStatus !== 'good') failures.push('node_image_not_good');
  }
  return failures;
};

/**
 * @param response  parsed analysis (already schema-validated by mlClient)
 * @param expected  { model, dim, galleryIds: string[], imageCount, floors: { minSimilarity, minMargin } }
 * @returns { faces, downgraded, excludedStudents }  faces[].decision is the EFFECTIVE decision
 */
const validateAnalysis = (response, expected) => {
  if (response.embeddingModel !== expected.model) {
    throw invalid('model_mismatch', `service runs "${response.embeddingModel}", gallery was built for "${expected.model}"`);
  }
  if (response.embeddingDim !== expected.dim) {
    throw invalid('dimension_mismatch', `embedding dimension ${response.embeddingDim} != ${expected.dim}`);
  }

  const gallery = new Set(expected.galleryIds);
  const seenFaceIds = new Set();
  const claimedBy = new Map();
  const imageStatusOf = (index) => {
    const entry = (response.imageQualities || []).find((item) => item.index === index);
    return entry ? entry.status : response.imageQuality.status;
  };

  const counts = { [ML_DECISION.HIGH]: 0, [ML_DECISION.REVIEW]: 0, [ML_DECISION.UNKNOWN]: 0 };
  const faces = [];
  let downgraded = 0;

  for (const face of response.faces) {
    if (seenFaceIds.has(face.faceId)) throw invalid('duplicate_face_id', `faceId ${face.faceId} appears twice`);
    seenFaceIds.add(face.faceId);

    const match = /^img(\d+)_/.exec(face.faceId);
    const imageIndex = match ? Number(match[1]) - 1 : 0;
    if (imageIndex < 0 || imageIndex >= expected.imageCount) throw invalid('face_image_index', `faceId ${face.faceId} points outside the uploaded images`);

    if (face.studentId != null) {
      if (!gallery.has(face.studentId)) throw invalid('student_not_in_gallery', `face ${face.faceId} names a student that was not sent`);
      if (claimedBy.has(face.studentId)) throw invalid('student_claimed_twice', `student ${face.studentId} is claimed by ${claimedBy.get(face.studentId)} and ${face.faceId}`);
      claimedBy.set(face.studentId, face.faceId);
    }

    // "medium_confidence" is a legacy label; it has never meant "confirmed".
    const mlDecision = face.decision === ML_DECISION.MEDIUM ? ML_DECISION.REVIEW : face.decision;
    counts[mlDecision] += 1;
    const mlReasons = reasonCodesOf(face);
    let decision = mlDecision;
    let contractReasons = [];

    if (mlDecision === ML_DECISION.HIGH) {
      contractReasons = highConfidenceFailures(face, {
        policy: response.policy,
        floors: expected.floors,
        imageStatus: imageStatusOf(imageIndex)
      });
      if (contractReasons.length) {
        decision = ML_DECISION.REVIEW;
        downgraded += 1;
      }
    }

    faces.push({
      ...face,
      decision,
      mlDecision,
      reasonCodes: [...mlReasons, ...contractReasons],
      contractReasons
    });
  }

  if (response.summary) {
    const { detectedFaces, highConfidence, needsReview, unknown } = response.summary;
    const mismatch =
      detectedFaces !== response.faces.length ||
      highConfidence !== counts[ML_DECISION.HIGH] ||
      needsReview !== counts[ML_DECISION.REVIEW] ||
      unknown !== counts[ML_DECISION.UNKNOWN];
    if (mismatch) throw invalid('summary_mismatch', 'summary counts do not match the faces returned');
  }

  return { faces, downgraded, excludedStudents: response.excludedStudents || [] };
};

module.exports = { validateAnalysis, highConfidenceFailures, reasonCodesOf };
