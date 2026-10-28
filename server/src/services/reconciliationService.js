const env = require('../config/env');
const { RECORD_STATUS, AI_DECISION, ML_DECISION } = require('../config/constants');

// Similarity alone decides: a face matched to an enrolled student at or above the threshold is Present, whatever
// confidence tier the ML service put it in. Students with no matching face are Absent. There is no review state.
const isMatched = (face) =>
  [ML_DECISION.HIGH, ML_DECISION.REVIEW, ML_DECISION.MEDIUM].includes(face.decision) &&
  Boolean(face.studentId) &&
  (face.similarity ?? 0) >= env.presentSimilarityThreshold;

const toEvidence = (imageId, face) => ({
  imageId,
  faceId: face.faceId,
  bbox: face.bbox,
  similarity: face.similarity ?? null,
  faceQuality: face.faceQuality ?? null,
  detectionConfidence: face.detectionConfidence ?? null,
  decision: AI_DECISION.HIGH
});

const compareEvidence = (a, b) => (b.similarity ?? 0) - (a.similarity ?? 0);

const collectDetections = (enrolledCodes, imageResults) => {
  const detections = new Map();
  const unknownFaces = [];
  const unassignedFaces = [];

  for (const { imageId, response } of imageResults) {
    for (const face of response.faces) {
      if (!isMatched(face)) {
        // Not recognised: left for the professor to enroll / assign.
        unknownFaces.push({
          imageId,
          faceId: face.faceId,
          bbox: face.bbox,
          similarity: face.similarity ?? null,
          faceQuality: face.faceQuality ?? null
        });
      } else if (!enrolledCodes.has(face.studentId)) {
        unassignedFaces.push({
          imageId,
          faceId: face.faceId,
          bbox: face.bbox,
          predictedStudentId: face.studentId,
          similarity: face.similarity ?? null,
          reason: 'not_enrolled'
        });
      } else {
        if (!detections.has(face.studentId)) detections.set(face.studentId, []);
        detections.get(face.studentId).push(toEvidence(imageId, face));
      }
    }
  }
  return { detections, unknownFaces, unassignedFaces };
};

const buildRecord = (student, evidence) => {
  if (!evidence || evidence.length === 0) {
    return {
      student: student._id,
      studentCode: student.studentId,
      status: RECORD_STATUS.ABSENT,
      decision: AI_DECISION.NOT_DETECTED,
      confidence: null,
      faceQuality: null,
      aiStudentId: null,
      evidence: []
    };
  }
  const sorted = [...evidence].sort(compareEvidence);
  const best = sorted[0];
  return {
    student: student._id,
    studentCode: student.studentId,
    status: RECORD_STATUS.PRESENT,
    decision: AI_DECISION.HIGH,
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
    records,
    unknownFaces,
    unassignedFaces,
    counts: {
      totalStudents: records.length,
      presentCount: count(RECORD_STATUS.PRESENT),
      absentCount: count(RECORD_STATUS.ABSENT),
      needsReviewCount: count(RECORD_STATUS.NEEDS_REVIEW)
    }
  };
};

module.exports = { reconcile };
