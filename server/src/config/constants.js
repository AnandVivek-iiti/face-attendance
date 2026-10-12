const ROLES = Object.freeze({ ADMIN: 'admin', PROFESSOR: 'professor', STUDENT: 'student' });

const SESSION_STATUS = Object.freeze({
  DRAFT: 'draft',
  PROCESSING: 'processing',
  REVIEW: 'review',
  FINALIZED: 'finalized',
  FAILED: 'failed'
});

const RECORD_STATUS = Object.freeze({ PRESENT: 'present', ABSENT: 'absent', NEEDS_REVIEW: 'needs_review' });

const RECORD_SOURCE = Object.freeze({ AI: 'ai', MANUAL: 'manual', AI_REVIEWED: 'ai_reviewed' });

const AI_DECISION = Object.freeze({
  HIGH: 'high_confidence',
  REVIEW: 'needs_review',
  NOT_DETECTED: 'not_detected'
});

const ML_DECISION = Object.freeze({
  HIGH: 'high_confidence',
  REVIEW: 'needs_review',
  MEDIUM: 'medium_confidence',
  UNKNOWN: 'unknown'
});

const ML_PATHS = Object.freeze({ EMBEDDING: '/embeddings', ANALYZE: '/analyze' });

const IMAGE_MIME_TYPES = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
});

const LIMITS = Object.freeze({
  IMAGES_PER_REQUEST: 10,
  IMAGES_PER_SESSION: 20,
  PROCESSING_STALE_MS: 10 * 60 * 1000,
  TEMP_FILE_MAX_AGE_MS: 60 * 60 * 1000,
  MAX_PAGE_SIZE: 100
});

const AUDIT_ACTIONS = Object.freeze({
  SESSION_CREATED: 'session_created',
  IMAGES_UPLOADED: 'images_uploaded',
  ANALYSIS_COMPLETED: 'analysis_completed',
  ANALYSIS_FAILED: 'analysis_failed',
  AI_MARKED_PRESENT: 'ai_marked_present',
  AI_MARKED_ABSENT: 'ai_marked_absent',
  AI_FLAGGED_REVIEW: 'ai_flagged_review',
  RECORD_CONFIRMED: 'record_confirmed',
  RECORD_STATUS_CHANGED: 'record_status_changed',
  IDENTITY_CHANGED: 'identity_changed',
  SESSION_FINALIZED: 'session_finalized'
});

module.exports = {
  ROLES,
  SESSION_STATUS,
  RECORD_STATUS,
  RECORD_SOURCE,
  AI_DECISION,
  ML_DECISION,
  ML_PATHS,
  IMAGE_MIME_TYPES,
  LIMITS,
  AUDIT_ACTIONS
};
