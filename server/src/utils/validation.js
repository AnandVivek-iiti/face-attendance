const { z } = require('zod');
const { SESSION_STATUS, LIMITS } = require('../config/constants');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const text = (max = 120) => z.string().trim().min(1).max(max);
const section = text(10).transform((value) => value.toUpperCase());
const semester = z.coerce.number().int().min(1).max(12);
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(LIMITS.MAX_PAGE_SIZE).default(20);
const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const login = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200)
});

const studentFields = {
  studentId: text(32),
  rollNumber: text(32),
  name: text(120),
  department: text(100),
  semester,
  section
};

const createStudent = z.object({ ...studentFields, active: z.boolean().optional() });

const updateStudent = z
  .object({ ...studentFields, active: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const listStudents = z.object({
  page,
  limit,
  semester: semester.optional(),
  section: section.optional(),
  department: text(100).optional(),
  active: booleanString.optional(),
  q: text(100).optional()
});

const createCourse = z.object({
  courseCode: text(32),
  courseName: text(150),
  professorId: objectId,
  semester,
  section
});

const createSession = z.object({ courseId: objectId, date: dateString.optional() });

const updateRecord = z
  .object({
    status: z.enum(['present', 'absent']).optional(),
    reassignTo: text(64).optional(),
    note: z.string().trim().max(500).optional()
  })
  .refine((value) => (value.status !== undefined) !== (value.reassignTo !== undefined), {
    message: 'Provide exactly one of status or reassignTo'
  });

const history = z.object({
  page,
  limit,
  courseId: objectId.optional(),
  studentId: text(64).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  status: z.enum(Object.values(SESSION_STATUS)).optional()
});

module.exports = {
  login,
  createStudent,
  updateStudent,
  listStudents,
  createCourse,
  createSession,
  updateRecord,
  history
};
