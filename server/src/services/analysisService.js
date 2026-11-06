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
const { createLimiter } = require('../utils/limiter');
const studentService = require('./studentService');
const Student = require('../models/Student');
const {
  SESSION_STATUS,
  RECORD_STATUS,
  AUDIT_ACTIONS,
  LIMITS
} = require('../config/constants');

const MAX_PARALLEL_ANALYSES = 2;
const limit = createLimiter(MAX_PARALLEL_ANALYSES);

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

const qualityOf = (value) => ({
  status: value.status,
  blurScore: value.blurScore ?? null,
  brightnessScore: value.brightnessScore ?? null,
  message: value.message ?? null
});

const describeImage = (image) => ({
  imageId: image._id,
  originalName: image.originalName,
  message: (image.quality && image.quality.message) || DEFAULT_QUALITY_MESSAGE
});

// Faces arrive flat, with the image index encoded in faceId ("img2_face_003") when more than one image was sent.
const groupFacesByImage = (faces, images) => {
  const byImage = images.map(() => []);
  for (const face of faces) {
    const match = /^img(\d+)_/.exec(face.faceId);
    const index = match ? Number(match[1]) - 1 : 0;
    if (index < 0 || index >= images.length) continue;
    byImage[index].push(face);
  }
  return byImage;
};

const hasEmbedding = (student) => Array.isArray(student.faceEmbeddings) && student.faceEmbeddings.length > 0;

const validVector = (vector, dimension) =>
  Array.isArray(vector) && vector.length === dimension && vector.every((value) => Number.isFinite(value));

// Embeddings are only comparable when they were produced by the same model and have the expected dimension.
// Rebuild from the registered photo when possible; otherwise keep the old data but exclude it from this gallery.
const backfillMissingEmbeddings = async (enrolled, expectedModel, expectedDimension) => {
  const needsRebuild = enrolled.filter((student) =>
    !hasEmbedding(student) ||
    student.embeddingModel !== expectedModel ||
    !student.faceEmbeddings.every((vector) => validVector(vector, expectedDimension))
  );
  const CONCURRENCY = 4;
  const rebuilt = [];
  const failed = [];
  for (let i = 0; i < needsRebuild.length; i += CONCURRENCY) {
    await Promise.all(
      needsRebuild.slice(i, i + CONCURRENCY).map(async (student) => {
        try {
          if (!student.registeredImage) throw new Error('No registered photograph is available');
          const buffer = await storageService.readFile(student.registeredImage);
          const filename = student.registeredImage.split('/').pop();
          const lower = filename.toLowerCase();
          const mimeType = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
          const result = await mlClient.generateEmbedding({ buffer, filename, mimeType });
          if (result.embeddingModel !== expectedModel || result.embeddingDim !== expectedDimension || !validVector(result.embedding, expectedDimension)) {
            throw new Error('Generated embedding does not match the active ML model');
          }
          await Student.updateOne(
            { _id: student._id },
            { $set: { faceEmbeddings: [result.embedding], embeddingModel: result.embeddingModel, hasFaceEmbedding: true } }
          );
          student.faceEmbeddings = [result.embedding];
          student.embeddingModel = result.embeddingModel;
          student.hasFaceEmbedding = true;
          rebuilt.push(student.studentId);
        } catch (error) {
          failed.push({ studentId: student.studentId, reason: error.message });
          console.error(`Could not rebuild face reference for ${student.studentId}: ${error.message}`);
        }
      })
    );
  }
  return { rebuilt, failed };
};

const buildGallery = (enrolled, expectedModel, expectedDimension) => {
  const compatible = enrolled.filter((student) =>
    hasEmbedding(student) &&
    student.embeddingModel === expectedModel &&
    student.faceEmbeddings.every((vector) => validVector(vector, expectedDimension))
  );
  const gallery = compatible.map((student) => ({ studentId: student.studentId, embeddings: student.faceEmbeddings }));
  const studentsWithoutEmbedding = enrolled
    .filter((student) => !compatible.includes(student))
    .map((student) => student.studentId);
  return { gallery, embeddingModel: expectedModel, studentsWithoutEmbedding };
};

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
            source: record.source,
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

  // Roster can shrink between sessions (student deactivated).
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
  // The roster is the students already enrolled in this course's semester/section.
  if (!course.section) {
    // Student.section is required, so a course without one matches nobody and every face would look like a new student.
    throw new AppError('This course has no section, so its roster cannot be determined', 409, { code: 'COURSE_SECTION_MISSING' });
  }
  const enrolled = await studentService.listEnrolledForCourse(course);
  const mlHealth = await mlClient.getHealth();
  const embeddingRepair = await backfillMissingEmbeddings(enrolled, mlHealth.embeddingModel, mlHealth.embeddingDim);
  const { gallery, embeddingModel, studentsWithoutEmbedding } = buildGallery(enrolled, mlHealth.embeddingModel, mlHealth.embeddingDim);

  const images = session.uploadedImages.map((image) => ({ image, document: image }));
  await Promise.all(
    images.map(async (entry) => {
      entry.buffer = await storageService.readFile(entry.image.path);
    })
  );

  const response = await mlClient.analyzeClassroom({
    images: images.map((entry) => ({
      buffer: entry.buffer,
      filename: entry.image.filename,
      mimeType: entry.image.mimeType
    })),
    gallery,
    embeddingModel,
    includeEmbeddings: true,
    // A first session has no roster yet; still run detection so the professor can build the list by assigning each detected face.
    allowEmptyStudents: true
  });

  const perImageQuality = response.imageQualities || [];
  const facesByImage = groupFacesByImage(response.faces, images);

  images.forEach((entry, index) => {
    const reported = perImageQuality.find((item) => item.index === index);
    entry.image.quality = qualityOf(reported || response.imageQuality);
  });

  const usable = images.filter((entry) => entry.image.quality.status !== UNUSABLE);
  const unusable = images.filter((entry) => entry.image.quality.status === UNUSABLE);
  if (usable.length === 0) {
    throw new AppError(unusable[0].image.quality.message || DEFAULT_QUALITY_MESSAGE, 422, {
      code: 'IMAGE_UNUSABLE',
      details: { images: unusable.map((entry) => describeImage(entry.image)) }
    });
  }

  const outcome = reconciliationService.reconcile({
    students: enrolled,
    imageResults: usable.map((entry) => ({
      imageId: entry.image._id,
      response: { faces: facesByImage[images.indexOf(entry)] }
    }))
  });

  const reviewedIds = await persistRecords(session._id, outcome);
  const counts = await recordService.tally(session._id);

  // Keep the embeddings the ML returned so assigning a face later can promote it to a reference vector without re-running recognition.
  const allFaces = usable.flatMap((entry) =>
    facesByImage[images.indexOf(entry)].map((face) => ({
      faceId: face.faceId,
      imageId: entry.image._id,
      bbox: face.bbox,
      detectionConfidence: face.detectionConfidence ?? null,
      faceQuality: face.faceQuality ?? null,
      studentId: face.studentId ?? null,
      similarity: face.similarity ?? null,
      decision: face.decision,
      qualityTier: face.qualityTier ?? null,
      clusterId: face.clusterId ?? null,
      embedding: face.embedding ?? null
    }))
  );

  const warnings = [
    ...unusable.map((entry) => ({ type: 'image_unusable', ...describeImage(entry.image) })),
    ...(studentsWithoutEmbedding.length
      ? [{ type: 'missing_embeddings', message: 'Some enrolled students have no compatible face reference for the active ML model', studentIds: studentsWithoutEmbedding }]
      : []),
    ...(embeddingRepair.failed.length
      ? [{ type: 'embedding_repair_failed', message: 'Some face references could not be rebuilt; those students were excluded from automatic recognition', students: embeddingRepair.failed }]
      : [])
  ];

  session.set({
    ...counts,
    status: SESSION_STATUS.REVIEW,
    processingStartedAt: null,
    failure: { code: null, message: null, at: null },
    analysis: {
      analyzedAt: new Date(),
      embeddingModel: embeddingModel || null,
      imageResults: usable.map((entry) => ({
        imageId: entry.image._id,
        imageQuality: entry.image.quality,
        summary: null,
        faceCount: facesByImage[images.indexOf(entry)].length
      })),
      faces: allFaces,
      unknownFaces: outcome.unknownFaces,
      unknownClusterCount: outcome.unknownClusterCount,
      rosterSize: enrolled.length,
      unassignedFaces: outcome.unassignedFaces,
      studentsWithoutEmbedding,
      warnings
    }
  });
  await session.save();

  if (auditService.isEnabled()) {
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
  }
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
    user
      ? auditService.userEntry(user, { sessionId, action: AUDIT_ACTIONS.ANALYSIS_FAILED, note: error.message })
      : { sessionId, actorType: 'system', action: AUDIT_ACTIONS.ANALYSIS_FAILED, note: error.message }
  );
};

const execute = (session, user) =>
  limit(async () => {
    try {
      await runAnalysis(session, user);
    } catch (error) {
      try {
        await markFailure(session._id, error, user);
      } catch (cleanupError) {
        console.error('Failed to record analysis failure', cleanupError);
      }
    }
  });

const analyzeSession = async (id, user) => {
  const session = await sessionService.getOwnedSession(id, user);
  sessionService.assertNotFinalized(session);
  if (session.uploadedImages.length === 0) {
    throw new AppError('Upload at least one classroom image before analysis', 400, { code: 'NO_IMAGES' });
  }
  const claimed = await claim(session, user);
  const review = await sessionService.buildReview(claimed);

  setImmediate(() => {
    execute(claimed, user).catch((error) => console.error('Background analysis crashed', error));
  });
  return review;
};

const recoverInterrupted = async () => {
  const stuck = await AttendanceSession.find({ status: SESSION_STATUS.PROCESSING }).select('_id').lean();
  for (const { _id } of stuck) {
    const error = new AppError('Analysis was interrupted by a server restart. Run it again.', 503, {
      code: 'ANALYSIS_INTERRUPTED'
    });
    await markFailure(_id, error, null);
  }
  return stuck.length;
};

module.exports = { analyzeSession, recoverInterrupted };
