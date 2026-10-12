import { DECISION, SOURCE } from './constants';
import { toIsoDate } from './format';

const ASSET_BASE = (import.meta.env.VITE_ASSET_BASE_URL || '').replace(/\/$/, '');

export function unwrap(response) {
  const body = response?.data;
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
    const keys = Object.keys(body).filter((key) => key !== 'success' && key !== 'message');
    if (keys.length === 1) return body.data;
  }
  return body;
}

export function asList(payload, ...keys) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

export function assetUrl(url) {
  if (!url) return '';
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  return `${ASSET_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

function idOf(object) {
  return object?.id ?? object?._id ?? null;
}

export function normalizeUser(raw = {}) {
  return {
    id: idOf(raw),
    name: raw.name ?? raw.fullName ?? '',
    email: raw.email ?? '',
    role: String(raw.role ?? '').toLowerCase(),
    studentId: raw.studentId ?? raw.rollNumber ?? null,
    department: raw.department ?? '',
  };
}

export function normalizeStudent(raw = {}) {
  const rollNumber = raw.rollNumber ?? raw.studentId ?? '';
  const faceImages = (raw.faceImages ?? raw.faces ?? [])
    .map((item) => (typeof item === 'string' ? { url: item } : item))
    .map((item) => ({ id: idOf(item) ?? item.url, url: assetUrl(item.url ?? item.path) }));
  return {
    id: idOf(raw) ?? rollNumber,
    studentId: raw.studentId ?? rollNumber,
    rollNumber,
    name: raw.name ?? raw.fullName ?? '',
    email: raw.email ?? '',
    department: raw.department ?? '',
    year: raw.year ?? raw.batch ?? '',
    faceImages,
    faceCount: raw.faceCount ?? raw.faceImageCount ?? faceImages.length,
    hasEmbedding: raw.hasEmbedding ?? raw.embeddingReady ?? null,
  };
}

export function normalizeCourse(raw = {}) {
  const students = (raw.students ?? raw.enrolledStudents ?? []).map(normalizeStudent);
  return {
    id: idOf(raw),
    code: raw.code ?? raw.courseCode ?? '',
    name: raw.name ?? raw.title ?? '',
    department: raw.department ?? '',
    professorName: raw.professor?.name ?? raw.professorName ?? '',
    studentCount: raw.studentCount ?? raw.enrolledCount ?? students.length,
    students,
  };
}

function courseRef(raw) {
  if (!raw) return { id: null, code: '', name: '' };
  if (typeof raw === 'string') return { id: raw, code: '', name: '' };
  return { id: idOf(raw), code: raw.code ?? raw.courseCode ?? '', name: raw.name ?? raw.title ?? '' };
}

export function normalizeQuality(raw) {
  return {
    status: raw?.status ?? 'good',
    blurScore: raw?.blurScore ?? null,
    brightnessScore: raw?.brightnessScore ?? null,
    message: raw?.message ?? null,
  };
}

const FACE_IMAGE_PATTERN = /^img(\d+)_/;

function normalizeFace(face, position, imageIndex, imageId) {
  const faceId = face.faceId ?? `face_${position}`;
  return {
    key: `${imageId}:${faceId}`,
    faceId,
    imageId,
    imageIndex,
    bbox: face.bbox ?? [0, 0, 0, 0],
    detectionConfidence: face.detectionConfidence ?? null,
    faceQuality: face.faceQuality ?? null,
    studentId: face.studentId ?? null,
    similarity: face.similarity ?? null,
    decision: face.decision ?? DECISION.UNKNOWN,
  };
}

function analysisOf(raw) {
  if (raw?.analysis) return raw.analysis;
  if (raw && (raw.faces || raw.imageQuality)) return raw;
  return null;
}

function normalizeImage(raw, index) {
  const analysis = analysisOf(raw);
  const id = idOf(raw) ?? `image-${index}`;
  return {
    id,
    index,
    url: assetUrl(raw.url ?? raw.path ?? raw.imageUrl),
    width: raw.width ?? analysis?.width ?? null,
    height: raw.height ?? analysis?.height ?? null,
    analyzed: Boolean(analysis),
    hasQuality: Boolean(analysis?.imageQuality),
    imageQuality: normalizeQuality(analysis?.imageQuality),
    faces: (analysis?.faces ?? []).map((face, position) => normalizeFace(face, position, index, id)),
  };
}

function distributeFaces(images, faces) {
  faces.forEach((face, position) => {
    const match = FACE_IMAGE_PATTERN.exec(face.faceId ?? '');
    let index = match ? Number(match[1]) - 1 : 0;
    if (index < 0 || index >= images.length) index = 0;
    const image = images[index];
    if (image) image.faces.push(normalizeFace(face, position, index, image.id));
  });
}

function deriveQuality(images) {
  const measured = images.filter((image) => image.hasQuality);
  if (!measured.length) return normalizeQuality(null);
  const usable = measured.filter((image) => image.imageQuality.status !== 'unusable');
  if (!usable.length) return measured[0].imageQuality;
  const worst = measured.find((image) => image.imageQuality.status !== 'good');
  return worst ? { ...worst.imageQuality, status: 'poor' } : normalizeQuality(null);
}

function normalizeRecord(raw) {
  const studentId = raw.studentId ?? raw.student?.studentId ?? raw.student?.rollNumber ?? raw.rollNumber;
  const present = raw.status ?? (typeof raw.present === 'boolean' ? (raw.present ? 'present' : 'absent') : undefined);
  let source = raw.source;
  if (!source) {
    if (raw.manual) source = SOURCE.MANUAL;
    else if (raw.reviewed) source = SOURCE.REVIEWED;
  }
  return {
    studentId,
    rollNumber: raw.rollNumber ?? raw.student?.rollNumber ?? studentId,
    name: raw.name ?? raw.student?.name ?? '',
    status: present,
    source,
    faceKey: raw.faceId && raw.imageId ? `${raw.imageId}:${raw.faceId}` : null,
    ignored: Boolean(raw.ignored),
  };
}

export function normalizeSession(raw = {}) {
  const course = courseRef(raw.course ?? raw.courseId);
  const images = (raw.images ?? []).map(normalizeImage);
  const aggregate = analysisOf(raw);

  if (aggregate && !images.some((image) => image.analyzed)) {
    distributeFaces(images, aggregate.faces ?? []);
    images.forEach((image) => {
      image.analyzed = true;
    });
  }

  const imageQuality = aggregate?.imageQuality ? normalizeQuality(aggregate.imageQuality) : deriveQuality(images);

  let records = (raw.records ?? raw.attendance ?? []).map(normalizeRecord);
  if (!records.length && raw.course?.students?.length) {
    records = raw.course.students.map(normalizeStudent).map((student) => ({
      studentId: student.studentId,
      rollNumber: student.rollNumber,
      name: student.name,
      status: undefined,
      source: undefined,
      faceKey: null,
      ignored: false,
    }));
  }
  return {
    id: idOf(raw),
    status: raw.status ?? 'draft',
    course,
    date: toIsoDate(raw.date) || raw.date || '',
    images,
    imageQuality,
    records,
    errorMessage: raw.errorMessage ?? raw.error ?? null,
    finalizedAt: raw.finalizedAt ?? null,
  };
}

export function normalizeHistoryItem(raw = {}) {
  const status = raw.status ?? '';
  const own = raw.attendanceStatus ?? raw.myStatus ?? raw.record?.status ?? (['present', 'absent'].includes(status) ? status : null);
  const reviewed = raw.reviewed ?? raw.reviewedCount ?? null;
  const total = raw.total ?? raw.enrolled ?? (raw.present ?? 0) + (raw.absent ?? 0);
  return {
    id: raw.sessionId ?? idOf(raw),
    course: courseRef(raw.course ?? raw.courseId),
    date: toIsoDate(raw.date) || raw.date || '',
    present: raw.present ?? raw.presentCount ?? null,
    absent: raw.absent ?? raw.absentCount ?? null,
    total,
    reviewed,
    status: ['present', 'absent'].includes(status) && own ? 'finalized' : status,
    ownStatus: own,
  };
}
