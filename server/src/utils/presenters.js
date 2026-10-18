const isPopulatedStudent = (value) => Boolean(value) && typeof value === 'object' && 'studentId' in value;

const student = (value) => {
  if (!value) return null;
  if (!isPopulatedStudent(value)) return { id: value };
  return {
    id: value._id,
    studentId: value.studentId,
    rollNumber: value.rollNumber,
    name: value.name
  };
};

const course = (value) => {
  if (!value) return null;
  return {
    id: value._id,
    courseCode: value.courseCode,
    courseName: value.courseName,
    semester: value.semester,
    section: value.section
  };
};

const face = (value) => ({
  faceId: value.faceId,
  imageId: value.imageId,
  bbox: value.bbox || [],
  detectionConfidence: value.detectionConfidence ?? null,
  faceQuality: value.faceQuality ?? null,
  studentId: value.studentId ?? null,
  similarity: value.similarity ?? null,
  decision: value.decision ?? null
});

const image = (value) => ({
  id: value._id,
  originalName: value.originalName,
  mimeType: value.mimeType,
  size: value.size,
  uploadedAt: value.uploadedAt,
  // The client renders photos from this URL.
  url: value.path ? `/api/files/${value.path}` : null,
  imageQuality:
    value.quality && value.quality.status
      ? {
          status: value.quality.status,
          blurScore: value.quality.blurScore ?? null,
          brightnessScore: value.quality.brightnessScore ?? null,
          message: value.quality.message ?? null
        }
      : null,
  faces: []
});

const evidence = (value) => ({
  imageId: value.imageId,
  faceId: value.faceId,
  bbox: value.bbox,
  similarity: value.similarity,
  faceQuality: value.faceQuality,
  decision: value.decision
});

const record = (value) => {
  const populated = isPopulatedStudent(value.studentId) ? value.studentId : null;
  return {
    id: value._id,
    sessionId: value.sessionId,
    studentId: populated ? populated.studentId : null,
    rollNumber: populated ? populated.rollNumber : null,
    name: populated ? populated.name : null,
    status: value.status,
    source: value.source,
    decision: value.decision,
    confidence: value.confidence ?? null,
    faceQuality: value.faceQuality ?? null,
    aiStudentId: value.aiStudentId ?? null,
    faceId: value.evidence && value.evidence[0] ? value.evidence[0].faceId : null,
    imageId: value.evidence && value.evidence[0] ? value.evidence[0].imageId : null,
    evidence: (value.evidence || []).map(evidence),
    ignored: Boolean(value.ignored),
    reviewedByProfessor: value.reviewedByProfessor,
    reviewedAt: value.reviewedAt ?? null
  };
};

const counts = (value) => ({
  totalStudents: value.totalStudents,
  presentCount: value.presentCount,
  absentCount: value.absentCount,
  needsReviewCount: value.needsReviewCount
});

const sessionCourse = (value, courseDoc) => {
  if (courseDoc) return course(courseDoc);
  if (value.courseId && value.courseId.courseCode) return course(value.courseId);
  return { id: value.courseId };
};

const sessionSummary = (value, courseDoc) => ({
  id: value._id,
  course: sessionCourse(value, courseDoc),
  professorId: value.professorId,
  date: value.date,
  status: value.status,
  ...counts(value),
  imageCount: (value.uploadedImages || []).length,
  finalizedAt: value.finalizedAt ?? null,
  createdAt: value.createdAt
});

// The stored analysis keeps every detected face's embedding so a later assignment can reuse it.
const publicAnalysis = (analysis) => {
  if (!analysis) return null;
  const plain = typeof analysis.toObject === 'function' ? analysis.toObject() : analysis;
  return {
    ...plain,
    faces: Array.isArray(plain.faces)
      ? plain.faces.map(({ embedding, ...rest }) => rest)
      : plain.faces
  };
};

// Full session payload.
const session = (value, courseDoc) => {
  const analysis = value.analysis || null;
  const images = (value.uploadedImages || []).map(image);

  if (analysis && Array.isArray(analysis.faces)) {
    const byId = new Map(images.map((item) => [String(item.id), item]));
    for (const item of analysis.faces) {
      const target = byId.get(String(item.imageId));
      if (target) target.faces.push(face(item));
    }
  }

  return {
    ...sessionSummary(value, courseDoc),
    images,
    // Aggregate quality: worst usable shot, or the first unusable one.
    imageQuality: analysis ? analysis.imageQuality ?? deriveQuality(images) : null,
    faces: analysis && Array.isArray(analysis.faces) ? analysis.faces.map(face) : [],
    failure: value.failure && value.failure.code ? value.failure : null,
    analysis: publicAnalysis(analysis),
    updatedAt: value.updatedAt
  };
};

function deriveQuality(images) {
  const measured = images.filter((item) => item.imageQuality);
  if (!measured.length) return null;
  const unusable = measured.find((item) => item.imageQuality.status === 'unusable');
  if (unusable) return unusable.imageQuality;
  const poor = measured.find((item) => item.imageQuality.status !== 'good');
  return poor ? { ...poor.imageQuality, status: 'poor' } : null;
}

module.exports = { publicAnalysis, student, course, face, image, evidence, record, counts, session, sessionSummary };
