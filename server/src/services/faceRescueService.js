// Disabled intentionally.
// The previous rescue pass promoted unmatched embeddings using similarity alone,
// bypassing the ML service's quality and ambiguity-margin decision. Keep this
// compatibility module inert so an accidental legacy import cannot auto-assign IDs.
const rescueUnmatchedFaces = () => 0;

module.exports = { rescueUnmatchedFaces };
