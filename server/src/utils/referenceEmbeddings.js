// Pure helpers for a student's reference face vectors (no database access, so they are unit-testable).
const MAX_REFERENCE_EMBEDDINGS = 5;
const DUPLICATE_EMBEDDING_COSINE = 0.97;

const cosine = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

// Skip a near-duplicate of an existing reference. At the cap, keep the FIRST reference (the enrolment photo) and
// evict the oldest later one, so one bad capture cannot push the original out.
const nextReferences = (current, embedding) => {
  if (current.some((ref) => cosine(ref, embedding) >= DUPLICATE_EMBEDDING_COSINE)) return current;
  if (current.length < MAX_REFERENCE_EMBEDDINGS) return [...current, embedding];
  return [current[0], ...current.slice(2), embedding];
};

module.exports = { MAX_REFERENCE_EMBEDDINGS, DUPLICATE_EMBEDDING_COSINE, cosine, nextReferences };

// Should a professor's face assignment add the classroom face as a reference vector for the chosen student?
// Pure: the caller loads the student's current references.
//   student: { embeddingModel, faceEmbeddings, hasRegisteredPhoto }
//   face:    { studentId (who the ML service suggested), similarity }
const decideAssignmentEmbedding = ({ student, face, assignedStudentId, sessionModel, optIn, minSimilarity }) => {
  if (!sessionModel) return { action: 'skip', reason: 'no_model' };
  const refs = Array.isArray(student.faceEmbeddings) ? student.faceEmbeddings : [];
  const sameModel = student.embeddingModel === sessionModel;
  const hasUsable = refs.length > 0 && sameModel;

  // Bootstrap: with no usable reference the student can never be recognised, so the professor's confirmed face becomes it.
  if (!hasUsable) {
    // Old-model vectors are unusable here, but a registered photo can rebuild them properly; do not replace its source of truth
    // with one classroom crop.
    if (refs.length > 0 && !sameModel && student.hasRegisteredPhoto) return { action: 'skip', reason: 'rebuild_from_photo' };
    return { action: 'append', reason: 'bootstrap' };
  }

  if (!optIn) return { action: 'skip', reason: 'opt_in_off' };
  // Only grow the gallery with a face the ML service independently suggested for this same student; a professor correcting a
  // wrong match must not feed that face into someone's references.
  if (face.studentId !== assignedStudentId) return { action: 'skip', reason: 'not_ml_suggested' };
  if (!(face.similarity >= minSimilarity)) return { action: 'skip', reason: 'similarity_below_floor' };
  return { action: 'append', reason: 'confirmed_high_similarity' };
};

module.exports.decideAssignmentEmbedding = decideAssignmentEmbedding;
