import { DECISION } from './constants';
import { toIsoDate } from './format';
import { loadAuth } from './storage';

const ASSET_BASE = (import.meta.env.VITE_ASSET_BASE_URL || '').replace(/\/$/, '');

export function unwrap(response) {
  const body = response?.data;
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
    // The server pairs `data` with `pagination` on list endpoints. Only treat the
    // payload as wrapped when `data` is the sole meaningful key.
    const keys = Object.keys(body).filter(
      (key) => key !== 'success' && key !== 'message' && key !== 'pagination',
    );
    if (keys.length === 1) return body.data;
  }
  return body;
}

export function unwrapWithMeta(response) {
  const body = response?.data;
  if (body && typeof body === 'object' && 'data' in body) {
    return { data: body.data, pagination: body.pagination ?? null };
  }
  return { data: body, pagination: null };
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
  if (/^(blob:|data:)/i.test(url)) return url;
  const absolute = /^(https?:)/i.test(url)
    ? url
    : `${ASSET_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
  // File URLs are served behind auth (/api/files requires professor/admin).
  // <img> and Image() send no Authorization header, so the JWT travels as a
  // query param the files route explicitly accepts.
  if (absolute.includes('/api/files/')) {
    const token = loadAuth()?.token;
    if (token) return `${absolute}${absolute.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  }
  return absolute;
}

function idOf(object) {
  return object?.id ?? object?._id ?? null;
}

export function normalizeUser(raw = {}) {
  const profile = raw.profile ?? null;
  return {
    id: idOf(raw),
    name: raw.name ?? raw.fullName ?? '',
    email: raw.email ?? '',
    role: String(raw.role ?? '').toLowerCase(),
    studentId: raw.studentId ?? raw.rollNumber ?? null,
    department: raw.department ?? profile?.department ?? '',
    profile,
    profileComplete: raw.profileComplete ?? Boolean(profile?.rollNumber),
  };
}

export function isProfileComplete(user) {
  if (!user || user.role !== 'student') return true;
  return Boolean(user.profileComplete);
}

export function normalizeStudent(raw = {}) {
  const rollNumber = raw.rollNumber ?? raw.studentId ?? '';
  let faceImages = (raw.faceImages ?? raw.faces ?? [])
    .map((item) => (typeof item === 'string' ? { url: item } : item))
    .map((item) => ({ id: idOf(item) ?? item.url, url: assetUrl(item.url ?? item.path) }));
  // The server stores a single `registeredImage` relative path (served from
  // /api/files), not an array, so synthesize one entry when no array is sent.
  if (!faceImages.length && raw.registeredImage) {
    faceImages = [{ id: 'registered', url: assetUrl(`/api/files/${raw.registeredImage}`) }];
  }
  return {
    id: idOf(raw) ?? rollNumber,
    studentId: raw.studentId ?? rollNumber,
    rollNumber,
    name: raw.name ?? raw.fullName ?? '',
    email: raw.email ?? '',
    department: raw.department ?? '',
    semester: raw.semester ?? null,
    section: raw.section ?? '',
    year: raw.year ?? raw.batch ?? '',
    faceImages,
    faceCount: raw.faceCount ?? raw.faceImageCount ?? faceImages.length,
    hasEmbedding: raw.hasEmbedding ?? raw.hasFaceEmbedding ?? raw.embeddingReady ?? null,
    autoEnrolled: Boolean(raw.autoEnrolled),
    active: raw.active ?? true,
  };
}

export function normalizeCourse(raw = {}) {
  const students = (raw.students ?? raw.enrolledStudents ?? []).map(normalizeStudent);
  return {
    id: idOf(raw),
    code: raw.code ?? raw.courseCode ?? '',
    name: raw.name ?? raw.title ?? raw.courseName ?? '',
    department: raw.department ?? '',
    semester: raw.semester ?? null,
    section: raw.section ?? '',
    room: raw.room ?? '',
    professorId: raw.professorId ?? raw.professor?.id ?? '',
    professorName: raw.professor?.name ?? raw.professorName ?? '',
    professorEmail: raw.professor?.email ?? raw.professorEmail ?? '',
    studentCount: raw.studentCount ?? raw.enrolledCount ?? students.length,
    students,
    rollNumberPattern: raw.rollNumberPattern
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
  const id = idOf(raw) ?? `image-${index}`;
  const faces = raw.faces ?? analysisOf(raw)?.faces ?? [];
  return {
    id,
    index,
    url: assetUrl(raw.url ?? raw.path ?? raw.imageUrl),
    width: raw.width ?? null,
    height: raw.height ?? null,
    analyzed: Boolean(raw.imageQuality || analysisOf(raw)),
    hasQuality: Boolean(raw.imageQuality),
    imageQuality: normalizeQuality(raw.imageQuality),
    faces: faces.map((face, position) => normalizeFace(face, position, index, id)),
  };
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
  // The server sends flat roll number/name alongside the status. Older shapes
  // nested them under a populated student object.
  const studentId = raw.studentId ?? raw.student?.studentId ?? raw.student?.rollNumber ?? raw.rollNumber;
  const present = raw.status ?? (typeof raw.present === 'boolean' ? (raw.present ? 'present' : 'absent') : undefined);
  return {
    studentId,
    rollNumber: raw.rollNumber ?? raw.student?.rollNumber ?? studentId,
    name: raw.name ?? raw.student?.name ?? '',
    status: present,
    source: raw.source,
    faceKey: raw.faceId && raw.imageId ? `${raw.imageId}:${raw.faceId}` : raw.faceKey ?? null,
    ignored: Boolean(raw.ignored),
  };
}

export function normalizeSession(raw = {}) {
  const course = courseRef(raw.course ?? raw.courseId);
  // The server now sends each image with its own faces and quality already
  // attached, so the flat fallback is only for older payloads.
  const images = (raw.images ?? raw.uploadedImages ?? []).map(normalizeImage);

  let imageQuality = raw.imageQuality ? normalizeQuality(raw.imageQuality) : deriveQuality(images);

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
    warnings: raw.warnings ?? [],
    errorMessage: raw.failure?.message ?? raw.errorMessage ?? raw.error ?? null,
    finalizedAt: raw.finalizedAt ?? null,
  };
}

export function normalizeHistoryItem(raw = {}) {
  const status = raw.status ?? '';
  const own = raw.attendanceStatus ?? raw.myStatus ?? raw.record?.status ?? (['present', 'absent'].includes(status) ? status : null);
  const reviewed = raw.reviewed ?? raw.reviewedCount ?? null;
  const total =
    raw.total ??
    raw.totalStudents ??
    raw.enrolled ??
    (raw.present ?? raw.presentCount ?? 0) + (raw.absent ?? raw.absentCount ?? 0);
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
