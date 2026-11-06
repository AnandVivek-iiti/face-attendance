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
