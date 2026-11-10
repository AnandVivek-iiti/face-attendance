const { RECORD_STATUS, AI_DECISION, ML_DECISION } = require('../config/constants');

// Faces arriving here have already passed mlContract.validateAnalysis, so face.decision is the EFFECTIVE decision: it can be weaker
// than what the ML service said, never stronger. Reconciliation only maps decisions to attendance records.

const isKnownStudentMatch = (face, enrolledCodes) =>
  Boolean(face.studentId) &&
  enrolledCodes.has(face.studentId) &&
  [ML_DECISION.HIGH, ML_DECISION.REVIEW, ML_DECISION.MEDIUM].includes(face.decision);

const toEvidence = (imageId, face) => ({
  imageId,
  faceId: face.faceId,
  bbox: face.bbox,
  similarity: face.similarity ?? null,
  faceQuality: face.faceQuality ?? null,
  detectionConfidence: face.detectionConfidence ?? null,
  matchMargin: face.matchMargin ?? null,
  qualityTier: face.qualityTier ?? null,
  decisionReason: face.reasonCodes && face.reasonCodes.length ? face.reasonCodes.join(',') : null,
  qualityReasons: ((face.decisionDetail && face.decisionDetail.reasons) || [])
    .filter((reason) => reason.gate === 'quality')
    .map((reason) => reason.code),
  decision: face.decision === ML_DECISION.HIGH ? AI_DECISION.HIGH : AI_DECISION.REVIEW
});

const compareEvidence = (a, b) => (b.similarity ?? 0) - (a.similarity ?? 0);

const collectDetections = (enrolledCodes, imageResults) => {
  const detections = new Map();
  const unknownFaces = [];
  const unassignedFaces = [];

  for (const { imageId, response } of imageResults) {
    for (const face of response.faces) {
      if (!isKnownStudentMatch(face, enrolledCodes)) {
        if (face.studentId && !enrolledCodes.has(face.studentId) && face.decision !== ML_DECISION.UNKNOWN) {
          unassignedFaces.push({
            imageId, faceId: face.faceId, bbox: face.bbox,
            predictedStudentId: face.studentId, similarity: face.similarity ?? null,
            reason: 'not_enrolled'
          });
        } else {
          unknownFaces.push({
            imageId, faceId: face.faceId, bbox: face.bbox,
            similarity: face.similarity ?? null, faceQuality: face.faceQuality ?? null,
            qualityTier: face.qualityTier ?? null, clusterId: face.clusterId ?? null,
            decision: face.decision,
            candidates: face.candidates || []
          });
        }
        continue;
      }
      if (!detections.has(face.studentId)) detections.set(face.studentId, []);
      detections.get(face.studentId).push(toEvidence(imageId, face));
    }
  }
  return { detections, unknownFaces, unassignedFaces };
};

const buildRecord = (student, evidence) => {
  if (!evidence || evidence.length === 0) {
    return {
      student: student._id, studentCode: student.studentId,
      status: RECORD_STATUS.ABSENT, decision: AI_DECISION.NOT_DETECTED,
      confidence: null, faceQuality: null, aiStudentId: null, evidence: []
    };
  }

  const sorted = [...evidence].sort(compareEvidence);
  // More than one face claiming the same student breaks the "one student, one face" guarantee: never automatic.
  const contested = new Set(sorted.map((item) => `${item.imageId}:${item.faceId}`)).size > 1;
  const confirmed = contested ? undefined : sorted.find((item) => item.decision === AI_DECISION.HIGH);
  const best = confirmed || sorted[0];
  const isPresent = Boolean(confirmed);
  return {
    student: student._id,
    studentCode: student.studentId,
    status: isPresent ? RECORD_STATUS.PRESENT : RECORD_STATUS.NEEDS_REVIEW,
    decision: isPresent ? AI_DECISION.HIGH : AI_DECISION.REVIEW,
    confidence: best.similarity,
    faceQuality: best.faceQuality,
    aiStudentId: student.studentId,
    evidence: sorted
  };
};

const reconcile = ({ students, imageResults }) => {
  const enrolledCodes = new Set(students.map((student) => student.studentId));
  const { detections, unknownFaces, unassignedFaces } = collectDetections(enrolledCodes, imageResults);
  const records = students.map((student) => buildRecord(student, detections.get(student.studentId)));
  const count = (status) => records.filter((record) => record.status === status).length;
  return {
    records, unknownFaces, unassignedFaces,
    // Distinct people among the unknown faces: one person photographed twice counts once.
    unknownClusterCount: new Set(unknownFaces.map((face) => face.clusterId ?? `${face.imageId}:${face.faceId}`)).size,
    counts: {
      totalStudents: records.length,
      presentCount: count(RECORD_STATUS.PRESENT),
      absentCount: count(RECORD_STATUS.ABSENT),
      needsReviewCount: count(RECORD_STATUS.NEEDS_REVIEW)
    }
  };
};

module.exports = { reconcile };
