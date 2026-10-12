const Student = require('../models/Student');
const Course = require('../models/Course');
const AppError = require('../utils/AppError');
const mlClient = require('./mlClient');
const storageService = require('./storageService');
const { isObjectId } = require('../utils/objectId');
const { skipFor, toPagination } = require('../utils/pagination');
const { ROLES } = require('../config/constants');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getByRef = async (ref) => {
  const filter = isObjectId(ref) ? { _id: ref } : { studentId: ref };
  const student = await Student.findOne(filter);
  if (!student) throw new AppError('Student not found', 404, { code: 'STUDENT_NOT_FOUND' });
  return student;
};

const assertCanView = async (user, student) => {
  if (user.role === ROLES.ADMIN) return;
  if (user.role === ROLES.STUDENT && user.studentId === student.studentId) return;
  if (user.role === ROLES.PROFESSOR) {
    const teaches = await Course.exists({
      professorId: user._id,
      semester: student.semester,
      section: student.section
    });
    if (teaches) return;
  }
  throw new AppError('You are not authorized to view this student', 403, { code: 'FORBIDDEN' });
};

const professorScope = async (user) => {
  const courses = await Course.find({ professorId: user._id }).select('semester section').lean();
  return courses.map((course) => ({ semester: course.semester, section: course.section }));
};

const list = async (user, query) => {
  const conditions = [];

  if (user.role === ROLES.PROFESSOR) {
    const scope = await professorScope(user);
    if (scope.length === 0) return { students: [], pagination: toPagination(query, 0) };
    conditions.push({ $or: scope });
  }
  if (query.semester !== undefined) conditions.push({ semester: query.semester });
  if (query.section) conditions.push({ section: query.section });
  if (query.department) conditions.push({ department: query.department });
  if (query.active !== undefined) conditions.push({ active: query.active });
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    conditions.push({ $or: [{ name: pattern }, { studentId: pattern }, { rollNumber: pattern }] });
  }

  const filter = conditions.length ? { $and: conditions } : {};
  const [students, total] = await Promise.all([
    Student.find(filter).sort({ rollNumber: 1 }).skip(skipFor(query)).limit(query.limit),
    Student.countDocuments(filter)
  ]);
  return { students, pagination: toPagination(query, total) };
};

const getOne = async (user, ref) => {
  const student = await getByRef(ref);
  await assertCanView(user, student);
  return student;
};

const create = (data) => Student.create(data);

const update = async (ref, data) => {
  const student = await getByRef(ref);
  student.set(data);
  await student.save();
  return student;
};

const deactivate = async (ref) => {
  const student = await getByRef(ref);
  student.active = false;
  await student.save();
  return student;
};

const registerFace = async (ref, files) => {
  if (!files || files.length !== 1) {
    throw new AppError('Exactly one image is required in the "image" field', 400, { code: 'INVALID_UPLOAD' });
  }
  const student = await getByRef(ref);
  const [stored] = await storageService.commitUploads(files, 'registered-faces', `${student._id}-`);
  const previous = student.registeredImage;

  let updated;
  try {
    await Student.updateOne(
      { _id: student._id },
      { $set: { registeredImage: stored.relativePath, faceEmbedding: [], hasFaceEmbedding: false } }
    );
    updated = await Student.findById(student._id);
  } catch (error) {
    await storageService.removeFiles([stored.absolutePath]);
    throw error;
  }
  await storageService.removeStored(previous);
  return updated;
};

const generateEmbedding = async (ref) => {
  const student = await getByRef(ref);
  if (!student.registeredImage) {
    throw new AppError('Register a face image before generating an embedding', 409, { code: 'NO_REGISTERED_IMAGE' });
  }
  const buffer = await storageService.readFile(student.registeredImage);
  const filename = student.registeredImage.split('/').pop();
  const mimeType = filename.endsWith('.png') ? 'image/png' : filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  const result = await mlClient.generateEmbedding({ buffer, filename, mimeType });

  await Student.updateOne(
    { _id: student._id },
    { $set: { faceEmbedding: result.embedding, hasFaceEmbedding: true } }
  );
  const updated = await Student.findById(student._id);
  return { student: updated, embeddingSize: result.embedding.length, faceQuality: result.faceQuality ?? null };
};

const listEnrolledForCourse = (course) =>
  Student.find({ semester: course.semester, section: course.section, active: true })
    .select('+faceEmbedding')
    .sort({ rollNumber: 1 })
    .lean();

module.exports = {
  getByRef,
  list,
  getOne,
  create,
  update,
  deactivate,
  registerFace,
  generateEmbedding,
  listEnrolledForCourse
};
