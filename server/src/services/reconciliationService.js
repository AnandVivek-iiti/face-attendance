const { RECORD_STATUS, AI_DECISION, ML_DECISION } = require('../config/constants');

const DECISION_RANK = { [AI_DECISION.HIGH]: 2, [AI_DECISION.REVIEW]: 1 };

const normalizeDecision = (decision) => {
  if (decision === ML_DECISION.HIGH) return AI_DECISION.HIGH;
  if (decision === ML_DECISION.REVIEW || decision === ML_DECISION.MEDIUM) return AI_DECISION.REVIEW;
  return null;
};

const toEvidence = (imageId, face, decision) => ({
  imageId,
  faceId: face.faceId,
  bbox: face.bbox,
  similarity: face.similarity ?? null,
  faceQuality: face.faceQuality ?? null,
  detectionConfidence: face.detectionConfidence ?? null,
  decision
});

const compareEvidence = (a, b) => {
  const rankDiff = (DECISION_RANK[b.decision] || 0) - (DECISION_RANK[a.decision] || 0);
  if (rankDiff !== 0) return rankDiff;
  return (b.similarity ?? 0) - (a.similarity ?? 0);
};

const collectDetections = (enrolledCodes, imageResults) => {
  const detections = new Map();
  const unknownFaces = [];
  const unassignedFaces = [];

  for (const { imageId, response } of imageResults) {
    for (const face of response.faces) {
      const decision = normalizeDecision(face.decision);
      if (!decision) {
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
        detections.get(face.studentId).push(toEvidence(imageId, face, decision));
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
    status: best.decision === AI_DECISION.HIGH ? RECORD_STATUS.PRESENT : RECORD_STATUS.NEEDS_REVIEW,
    decision: best.decision,
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
