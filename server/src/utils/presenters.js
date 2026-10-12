const isPopulatedStudent = (value) => Boolean(value) && typeof value === 'object' && 'studentId' in value;

const student = (value) => {
  if (!value) return null;
  if (!isPopulatedStudent(value)) return { id: value };
  return { id: value._id, studentId: value.studentId, rollNumber: value.rollNumber, name: value.name };
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

const image = (value) => ({
  id: value._id,
  originalName: value.originalName,
  mimeType: value.mimeType,
  size: value.size,
  uploadedAt: value.uploadedAt,
  quality: value.quality && value.quality.status ? value.quality : null
});

const evidence = (value) => ({
  imageId: value.imageId,
  faceId: value.faceId,
  bbox: value.bbox,
  similarity: value.similarity,
  faceQuality: value.faceQuality,
  decision: value.decision
});

const record = (value) => ({
  id: value._id,
  sessionId: value.sessionId,
  student: student(value.studentId),
  status: value.status,
  source: value.source,
  decision: value.decision,
  confidence: value.confidence ?? null,
  faceQuality: value.faceQuality ?? null,
  aiStudentId: value.aiStudentId ?? null,
  evidence: (value.evidence || []).map(evidence),
  reviewedByProfessor: value.reviewedByProfessor,
  reviewedAt: value.reviewedAt ?? null
});

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

const session = (value, courseDoc) => ({
  ...sessionSummary(value, courseDoc),
  uploadedImages: (value.uploadedImages || []).map(image),
  failure: value.failure && value.failure.code ? value.failure : null,
  analysis: value.analysis ?? null,
  updatedAt: value.updatedAt
});

module.exports = { student, course, image, record, counts, session, sessionSummary };
