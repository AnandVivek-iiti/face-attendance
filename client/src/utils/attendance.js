import { DECISION, FACE_QUALITY_FAIR, FACE_QUALITY_GOOD, IMAGE_QUALITY, SOURCE } from './constants';

export function isUsable(image) {
  return !(image.hasQuality && image.imageQuality.status === IMAGE_QUALITY.UNUSABLE);
}

export function isSessionUnusable(session) {
  return session.imageQuality.status === IMAGE_QUALITY.UNUSABLE;
}

export function qualityAlerts(session) {
  const perImage = session.images.some((image) => image.hasQuality);
  if (perImage) {
    return session.images
      .filter((image) => image.hasQuality && image.imageQuality.status === IMAGE_QUALITY.UNUSABLE)
      .map((image) => ({ index: image.index, quality: image.imageQuality }));
  }
  if (session.imageQuality.status === IMAGE_QUALITY.GOOD) return [];
  return [{ index: null, quality: session.imageQuality }];
}

export function matchNote(face) {
  if (face.decision !== DECISION.UNKNOWN) return null;
  if (!face.similarity) return 'Not compared. The face is too small, blurry or poorly lit.';
  return 'No enrolled student matched closely enough.';
}

export function faceQualityLevel(score) {
  if (score === null || score === undefined) return null;
  if (score >= FACE_QUALITY_GOOD) return 'Good';
  if (score >= FACE_QUALITY_FAIR) return 'Fair';
  return 'Poor';
}

export const emptyReviewState = { overrides: {}, added: {}, dismissed: [] };

export function buildReview(session, state = emptyReviewState) {
  const { overrides, added, dismissed } = state;
  const usableImages = isSessionUnusable(session) ? [] : session.images.filter(isUsable);
  const faces = usableImages.flatMap((image) => image.faces);
  const faceByKey = new Map(faces.map((face) => [face.key, face]));

  const best = new Map();
  for (const face of faces) {
    if (!face.studentId || face.decision === DECISION.UNKNOWN) continue;
    const current = best.get(face.studentId);
    if (!current || (face.similarity ?? 0) > (current.similarity ?? 0)) best.set(face.studentId, face);
  }

  const known = new Set(session.records.map((record) => record.studentId));
  const records = [
    ...session.records,
    ...Object.values(added).filter((student) => !known.has(student.studentId)),
  ];

  const rows = records.map((record) => {
    const override = overrides[record.studentId];
    const faceKey = override?.faceKey ?? record.faceKey;
    const face = (faceKey && faceByKey.get(faceKey)) || best.get(record.studentId) || null;
    const aiResult = face ? face.decision : DECISION.NONE;
    const baseStatus = record.status ?? (aiResult === DECISION.HIGH ? 'present' : 'absent');
    const source = override?.source ?? record.source ?? SOURCE.AI;
    const reviewed = source === SOURCE.REVIEWED || source === SOURCE.MANUAL;
    return {
      studentId: record.studentId,
      rollNumber: record.rollNumber,
      name: record.name,
      face,
      aiResult,
      similarity: face?.similarity ?? null,
      faceQuality: face?.faceQuality ?? null,
      status: override?.status ?? baseStatus,
      source,
      reviewed,
      changed: Boolean(override),
      ignored: override?.ignored ?? record.ignored,
      isAdded: Boolean(added[record.studentId]),
      needsAttention: aiResult === DECISION.REVIEW && !reviewed,
    };
  });

  const rowIds = new Set(rows.map((row) => row.studentId));
  const ownerByKey = new Map();
  for (const row of rows) {
    const key = overrides[row.studentId]?.faceKey;
    if (key) ownerByKey.set(key, row);
  }
  for (const row of rows) {
    if (row.face && !ownerByKey.has(row.face.key)) ownerByKey.set(row.face.key, row);
  }

  const dismissedSet = new Set(dismissed);
  const faceViews = faces.map((face) => {
    let owner = ownerByKey.get(face.key) || null;
    if (!owner && face.studentId && face.decision !== DECISION.UNKNOWN && rowIds.has(face.studentId)) {
      owner = rows.find((row) => row.studentId === face.studentId) || null;
    }
    const unmatchedId = !owner && face.studentId && face.decision !== DECISION.UNKNOWN ? face.studentId : null;
    return {
      ...face,
      owner: owner ? owner.studentId : null,
      name: owner ? owner.name : unmatchedId ? `Not enrolled (${unmatchedId})` : 'Unknown face',
      dismissed: dismissedSet.has(face.key),
    };
  });

  const unmatchedFaces = faceViews.filter((face) => !face.owner && !face.dismissed);
  const detectedRows = rows.filter((row) => row.aiResult === DECISION.HIGH || row.aiResult === DECISION.REVIEW);

  const summary = {
    enrolled: rows.length,
    facesFound: faceViews.length,
    detected: detectedRows.length,
    highConfidence: rows.filter((row) => row.aiResult === DECISION.HIGH).length,
    needsReview: rows.filter((row) => row.aiResult === DECISION.REVIEW).length,
    pendingReview: rows.filter((row) => row.needsAttention).length,
    notDetected: rows.filter((row) => !row.face).length,
    unmatched: unmatchedFaces.length,
    present: rows.filter((row) => row.status === 'present').length,
    absent: rows.filter((row) => row.status !== 'present').length,
  };

  return { rows, faces: faceViews, unmatchedFaces, summary };
}

export function overridePayload(override) {
  const payload = { status: override.status, source: override.source };
  if (override.faceId) payload.faceId = override.faceId;
  if (override.imageId) payload.imageId = override.imageId;
  if (override.ignored) payload.ignored = true;
  return payload;
}

export function summarizeHistory(items) {
  const own = items.filter((item) => item.ownStatus);
  const present = own.filter((item) => item.ownStatus === 'present').length;
  const byCourse = new Map();
  for (const item of own) {
    const key = item.course.id ?? item.course.code ?? item.course.name;
    const entry = byCourse.get(key) ?? { course: item.course, present: 0, total: 0 };
    entry.total += 1;
    if (item.ownStatus === 'present') entry.present += 1;
    byCourse.set(key, entry);
  }
  return { total: own.length, present, courses: [...byCourse.values()] };
}
