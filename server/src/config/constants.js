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

const ENROLLMENT_REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
});

// Every account at IIIT Indore is keyed on an institutional email.
const IIIT_EMAIL_DOMAIN = 'iiti.ac.in';

// Auto-generated professor password for a newly created course.
// e.g. ME217 -> IIT@INDORE#ME217
const professorPasswordFor = (courseCode) => `IIT@INDORE#${String(courseCode).toUpperCase()}`;

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

const ML_PATHS = Object.freeze({ EMBEDDING: '/generate-embedding', ANALYZE: '/analyze-classroom' });

const IMAGE_MIME_TYPES = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
});

// Keep these aligned with the ML service (MAX_IMAGES_PER_REQUEST=5) and the
// client (MAX_IMAGES=5). One analysis request carries the whole batch.
const LIMITS = Object.freeze({
  IMAGES_PER_REQUEST: 5,
  IMAGES_PER_SESSION: 5,
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
  SESSION_FINALIZED: 'session_finalized',
  SESSION_DELETED: 'session_deleted',
  ENROLLMENT_REQUESTED: 'enrollment_requested',
  ENROLLMENT_APPROVED: 'enrollment_approved',
  ENROLLMENT_REJECTED: 'enrollment_rejected',
  COURSE_CREATED: 'course_created',
  COURSE_UPDATED: 'course_updated',
  COURSE_REMOVED: 'course_removed',
  PROFESSOR_ADDED: 'professor_added',
  DEPARTMENT_CREATED: 'department_created',
  DEPARTMENT_REMOVED: 'department_removed'
});

module.exports = {
  ROLES,
  SESSION_STATUS,
  RECORD_STATUS,
  RECORD_SOURCE,
  ENROLLMENT_REQUEST_STATUS,
  IIIT_EMAIL_DOMAIN,
  professorPasswordFor,
  AI_DECISION,
  ML_DECISION,
  ML_PATHS,
  IMAGE_MIME_TYPES,
  LIMITS,
  AUDIT_ACTIONS
};
