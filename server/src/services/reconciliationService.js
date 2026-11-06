const { RECORD_STATUS, AI_DECISION, ML_DECISION } = require('../config/constants');

const isKnownStudentMatch = (face, enrolledCodes) =>
  Boolean(face.studentId) && enrolledCodes.has(face.studentId) &&
  [ML_DECISION.HIGH, ML_DECISION.REVIEW, ML_DECISION.MEDIUM].includes(face.decision);

const toEvidence = (imageId, face) => ({
  imageId,
  faceId: face.faceId,
  bbox: face.bbox,
  similarity: face.similarity ?? null,
  faceQuality: face.faceQuality ?? null,
  detectionConfidence: face.detectionConfidence ?? null,
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
            qualityTier: face.qualityTier ?? null, clusterId: face.clusterId ?? null
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
  const confirmed = sorted.find((item) => item.decision === AI_DECISION.HIGH);
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
