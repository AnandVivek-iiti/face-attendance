const env = require('../config/env');
const { ML_DECISION } = require('../config/constants');

const norm = (vector) => {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) sum += vector[i] * vector[i];
  const length = Math.sqrt(sum) || 1;
  return vector.map((value) => value / length);
};

const dot = (a, b) => {
  if (a.length !== b.length) return -1;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
};

const isIdentified = (face, enrolledCodes) =>
  [ML_DECISION.HIGH, ML_DECISION.REVIEW, ML_DECISION.MEDIUM].includes(face.decision) &&
  Boolean(face.studentId) &&
  enrolledCodes.has(face.studentId) &&
  (face.similarity ?? 0) >= env.presentSimilarityThreshold;

// Second pass. Faces the ML service left unmatched are compared against the students nobody was matched to yet,
// and paired one-to-one (best score first). A pair at or above RESCUE_SIMILARITY_THRESHOLD becomes a match.
// Mutates `faces` in place and returns how many faces were rescued.
const rescueUnmatchedFaces = (faces, enrolled) => {
  const enrolledCodes = new Set(enrolled.map((student) => student.studentId));
  const taken = new Set(faces.filter((face) => isIdentified(face, enrolledCodes)).map((face) => face.studentId));

  const candidates = enrolled
    .filter((student) => !taken.has(student.studentId) && Array.isArray(student.faceEmbeddings) && student.faceEmbeddings.length)
    .map((student) => ({ studentId: student.studentId, refs: student.faceEmbeddings.map(norm) }));
  const open = faces.filter(
    (face) => !isIdentified(face, enrolledCodes) && Array.isArray(face.embedding) && face.embedding.length
  );
  if (!candidates.length || !open.length) return 0;

  const pairs = [];
  open.forEach((face, faceIndex) => {
    const query = norm(face.embedding);
    candidates.forEach((candidate, candidateIndex) => {
      let best = -1;
      for (const ref of candidate.refs) best = Math.max(best, dot(query, ref));
      if (best >= env.rescueSimilarityThreshold) pairs.push({ faceIndex, candidateIndex, score: best });
    });
  });
  pairs.sort((a, b) => b.score - a.score);

  const usedFaces = new Set();
  const usedStudents = new Set();
  let rescued = 0;
  for (const { faceIndex, candidateIndex, score } of pairs) {
    if (usedFaces.has(faceIndex) || usedStudents.has(candidateIndex)) continue;
    usedFaces.add(faceIndex);
    usedStudents.add(candidateIndex);
    const face = open[faceIndex];
    face.studentId = candidates[candidateIndex].studentId;
    face.similarity = Math.round(score * 10000) / 10000;
    face.decision = ML_DECISION.HIGH;
    rescued += 1;
  }
  return rescued;
};

module.exports = { rescueUnmatchedFaces };
