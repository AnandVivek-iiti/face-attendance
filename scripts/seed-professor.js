
const db = require('../server/src/config/db');
const User = require('../server/src/models/User');
const Course = require('../server/src/models/Course');
const Department = require('../server/src/models/Department');

const DEPARTMENTS = [
  { code: 'ME', name: 'Mechanical Engineering' },
  { code: 'CSE', name: 'Computer Science and Engineering' },
  { code: 'ECE', name: 'Electronics and Communication Engineering' },
  { code: 'EE', name: 'Electrical Engineering' },
  { code: 'CE', name: 'Civil Engineering' },
  { code: 'CH', name: 'Chemistry' },
  { code: 'MA', name: 'Mathematics' },
  { code: 'PH', name: 'Physics' }
];

// Courses are seeded from just a code + department for now (the semester is
// derived from the year so courses span every year of study). Add or remove
// rows below to change the shape of what gets seeded.
//
// Code format: <DEPARTMENT><year><serial>, e.g. ME101, ME202.
// 5 courses per department, covering years 1-4.
const COURSE_PATTERN = [
  { year: 1, serial: 1 },
  { year: 2, serial: 1 },
  { year: 3, serial: 1 },
  { year: 4, serial: 1 },
  { year: 2, serial: 2 }
];

const COURSES = DEPARTMENTS.flatMap(({ code }) =>
  COURSE_PATTERN.map(({ year, serial }) => ({
    courseCode: `${code}${year}0${serial}`,
    department: code,
    // Two terms per year; this places each course in its year's first term.
    semester: year * 2 - 1
  }))
);

// Fields the Course schema still requires that we do not vary for seeding.
const COURSE_DEFAULTS = {
  section: 'A'
};

// Course.professorId is required, so seeded courses need an owner. This account
// exists only to satisfy that constraint; it is not intended to sign in.
const PLACEHOLDER_PROFESSOR = {
  name: 'Seed Professor',
  email: 'seed.professor@iiti.ac.in'
};

const ensurePlaceholderProfessor = async () => {
  const existing = await User.findOne({ email: PLACEHOLDER_PROFESSOR.email });
  if (existing) return existing;
  return User.create({
    name: PLACEHOLDER_PROFESSOR.name,
    email: PLACEHOLDER_PROFESSOR.email,
    role: 'professor',
    department: COURSES[0]?.department || null,
    emailVerified: true
  });
};

const main = async () => {
  await db.connect();

  for (const dept of DEPARTMENTS) {
    const existing = await Department.findOne({ code: dept.code });
    if (!existing) await Department.create(dept);
  }
  console.log(`Departments ready (${DEPARTMENTS.length}).`);

  const professor = await ensurePlaceholderProfessor();

  let created = 0;
  for (const { courseCode, department, semester } of COURSES) {
    const existing = await Course.findOne({ courseCode });
    if (existing) {
      // Keep only the department in sync; leave the other fields untouched.
      if (existing.department !== department) {
        existing.department = department;
        await existing.save();
      }
      continue;
    }
    await Course.create({
      courseCode,
      department,
      courseName: courseCode,
      semester,
      section: COURSE_DEFAULTS.section,
      professorId: professor._id
    });
    created += 1;
  }
  console.log(`Courses ready (${COURSES.length}, ${created} new).`);
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.disconnect());
