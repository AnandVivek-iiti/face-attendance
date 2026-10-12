const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');
const courseService = require('./courseService');
const mlClient = require('./mlClient');
const recordService = require('./recordService');
const reconciliationService = require('./reconciliationService');
const sessionService = require('./sessionService');
const storageService = require('./storageService');
const studentService = require('./studentService');
const {
  SESSION_STATUS,
  RECORD_STATUS,
  RECORD_SOURCE,
  AUDIT_ACTIONS,
  LIMITS
} = require('../config/constants');

const ANALYZABLE_STATUSES = [SESSION_STATUS.DRAFT, SESSION_STATUS.FAILED, SESSION_STATUS.REVIEW];
const UNUSABLE = 'unusable';
const DEFAULT_QUALITY_MESSAGE = 'Classroom image quality is too low. Please upload a clearer photo.';

const claim = async (session, user) => {
  const staleCutoff = new Date(Date.now() - LIMITS.PROCESSING_STALE_MS);
  const claimed = await AttendanceSession.findOneAndUpdate(
    {
      _id: session._id,
      professorId: user._id,
      $or: [
        { status: { $in: ANALYZABLE_STATUSES } },
        { status: SESSION_STATUS.PROCESSING, processingStartedAt: { $lt: staleCutoff } }
      ]
    },
    { $set: { status: SESSION_STATUS.PROCESSING, processingStartedAt: new Date() } },
    { new: true }
  );
  if (!claimed) {
    throw new AppError('Analysis is already in progress for this session', 409, { code: 'ANALYSIS_IN_PROGRESS' });
  }
  return claimed;
};

const qualityOf = (response) => ({
  status: response.imageQuality.status,
  blurScore: response.imageQuality.blurScore ?? null,
  brightnessScore: response.imageQuality.brightnessScore ?? null,
  message: response.imageQuality.message ?? null
});

const analyzeImages = async (session, gallery) => {
  const pending = session.uploadedImages.filter((image) => !image.quality || image.quality.status !== UNUSABLE);
  if (pending.length === 0) {
    throw new AppError('All uploaded images were unusable. Upload a clearer classroom image.', 422, {
      code: 'IMAGE_UNUSABLE',
      details: { images: session.uploadedImages.map(describeImage) }
    });
  }

  const results = [];
  for (const image of pending) {
    const buffer = await storageService.readFile(image.path);
    const response = await mlClient.analyzeImage({
      buffer,
      filename: image.filename,
      mimeType: image.mimeType,
      gallery
    });
    image.quality = qualityOf(response);
    results.push({ image, response });
  }
  await session.save();
  return results;
};

const describeImage = (image) => ({
  imageId: image._id,
  originalName: image.originalName,
  message: (image.quality && image.quality.message) || DEFAULT_QUALITY_MESSAGE
});

const persistRecords = async (sessionId, outcome) => {
  const reviewed = await AttendanceRecord.find({ sessionId, reviewedByProfessor: true }).select('studentId').lean();
  const reviewedIds = new Set(reviewed.map((record) => String(record.studentId)));

  const operations = outcome.records
    .filter((record) => !reviewedIds.has(String(record.student)))
    .map((record) => ({
      updateOne: {
        filter: { sessionId, studentId: record.student },
        update: {
          $set: {
            status: record.status,
            source: RECORD_SOURCE.AI,
            decision: record.decision,
            confidence: record.confidence,
            faceQuality: record.faceQuality,
            aiStudentId: record.aiStudentId,
            evidence: record.evidence,
            reviewedByProfessor: false,
            reviewedAt: null
          }
        },
        upsert: true
      }
    }));
  if (operations.length) await AttendanceRecord.bulkWrite(operations);

  await AttendanceRecord.deleteMany({
    sessionId,
    studentId: { $nin: outcome.records.map((record) => record.student) },
    reviewedByProfessor: false
  });
  return reviewedIds;
};

const auditActionFor = (status) => {
  if (status === RECORD_STATUS.PRESENT) return AUDIT_ACTIONS.AI_MARKED_PRESENT;
  if (status === RECORD_STATUS.NEEDS_REVIEW) return AUDIT_ACTIONS.AI_FLAGGED_REVIEW;
  return AUDIT_ACTIONS.AI_MARKED_ABSENT;
};

const runAnalysis = async (session, user) => {
  const course = await courseService.getById(session.courseId);
  const enrolled = await studentService.listEnrolledForCourse(course);
  if (enrolled.length === 0) {
    throw new AppError('No active students are enrolled in this course', 409, { code: 'NO_STUDENTS' });
  }
  const withEmbedding = enrolled.filter((student) => student.faceEmbedding && student.faceEmbedding.length);
  if (withEmbedding.length === 0) {
    throw new AppError('No enrolled student has a face embedding yet', 409, { code: 'NO_EMBEDDINGS' });
  }
  const gallery = withEmbedding.map((student) => ({ studentId: student.studentId, embedding: student.faceEmbedding }));
  const studentsWithoutEmbedding = enrolled
    .filter((student) => !(student.faceEmbedding && student.faceEmbedding.length))
    .map((student) => student.studentId);

  const results = await analyzeImages(session, gallery);
  const usable = results.filter((result) => result.response.imageQuality.status !== UNUSABLE);
  const unusable = results.filter((result) => result.response.imageQuality.status === UNUSABLE);

  if (usable.length === 0) {
    throw new AppError(
      unusable[0].response.imageQuality.message || DEFAULT_QUALITY_MESSAGE,
      422,
      { code: 'IMAGE_UNUSABLE', details: { images: unusable.map((result) => describeImage(result.image)) } }
    );
  }

  const outcome = reconciliationService.reconcile({
    students: enrolled,
    imageResults: usable.map((result) => ({ imageId: result.image._id, response: result.response }))
  });
  const reviewedIds = await persistRecords(session._id, outcome);
  const counts = await recordService.tally(session._id);

  const warnings = [
    ...session.uploadedImages
      .filter((image) => image.quality && image.quality.status === UNUSABLE)
      .map((image) => ({ type: 'image_unusable', ...describeImage(image) })),
    ...(studentsWithoutEmbedding.length
      ? [{ type: 'missing_embeddings', message: 'Some enrolled students have no face embedding', studentIds: studentsWithoutEmbedding }]
      : [])
  ];

  session.set({
    ...counts,
    status: SESSION_STATUS.REVIEW,
    processingStartedAt: null,
    failure: { code: null, message: null, at: null },
    analysis: {
      analyzedAt: new Date(),
      imageResults: usable.map((result) => ({
        imageId: result.image._id,
        imageQuality: qualityOf(result.response),
        summary: result.response.summary || null,
        faceCount: result.response.faces.length
      })),
      unknownFaces: outcome.unknownFaces,
      unassignedFaces: outcome.unassignedFaces,
      studentsWithoutEmbedding,
      warnings
    }
  });
  await session.save();

  const entries = outcome.records
    .filter((record) => !reviewedIds.has(String(record.student)))
    .map((record) => ({
      sessionId: session._id,
      studentId: record.student,
      actorType: 'ai',
      action: auditActionFor(record.status),
      after: { status: record.status, confidence: record.confidence, aiStudentId: record.aiStudentId }
    }));
  entries.push(
    auditService.userEntry(user, {
      sessionId: session._id,
      action: AUDIT_ACTIONS.ANALYSIS_COMPLETED,
      after: { images: usable.length, ...counts }
    })
  );
  await auditService.recordMany(entries);

  return sessionService.buildReview(session);
};

const markFailure = async (sessionId, error, user) => {
  const hasRecords = await AttendanceRecord.exists({ sessionId });
  await AttendanceSession.updateOne(
    { _id: sessionId },
    {
      $set: {
        status: hasRecords ? SESSION_STATUS.REVIEW : SESSION_STATUS.FAILED,
        processingStartedAt: null,
        failure: { code: error.code || 'ANALYSIS_ERROR', message: error.message, at: new Date() }
      }
    }
  );
  await auditService.record(
    auditService.userEntry(user, {
      sessionId,
      action: AUDIT_ACTIONS.ANALYSIS_FAILED,
      note: error.message
    })
  );
};

const analyzeSession = async (id, user) => {
  const session = await sessionService.getOwnedSession(id, user);
  sessionService.assertNotFinalized(session);
  if (session.uploadedImages.length === 0) {
    throw new AppError('Upload at least one classroom image before analysis', 400, { code: 'NO_IMAGES' });
  }
  const claimed = await claim(session, user);

  try {
    return await runAnalysis(claimed, user);
  } catch (error) {
    try {
      await markFailure(claimed._id, error, user);
    } catch (cleanupError) {
      console.error('Failed to record analysis failure', cleanupError);
    }
    throw error;
  }
};

module.exports = { analyzeSession };
