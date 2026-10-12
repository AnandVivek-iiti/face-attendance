export const ROLES = { PROFESSOR: 'professor', STUDENT: 'student', ADMIN: 'admin' };

export const DECISION = {
  HIGH: 'high_confidence',
  REVIEW: 'needs_review',
  UNKNOWN: 'unknown',
  NONE: 'not_detected',
};

export const IMAGE_QUALITY = { GOOD: 'good', POOR: 'poor', UNUSABLE: 'unusable' };

export const SESSION_STATUS = {
  DRAFT: 'draft',
  ANALYZING: 'analyzing',
  ANALYZED: 'analyzed',
  FAILED: 'failed',
  FINALIZED: 'finalized',
};

export const POLLING_STATUSES = ['analyzing', 'processing', 'queued'];

export const SOURCE = { AI: 'ai', REVIEWED: 'ai_reviewed', MANUAL: 'manual' };

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES = 5;
export const MAX_IMAGE_PIXELS = 50000000;
export const STUDENT_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

export const FACE_QUALITY_GOOD = 0.8;
export const FACE_QUALITY_FAIR = 0.5;
