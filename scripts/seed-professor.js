
const db = require('../server/src/config/db');
const User = require('../server/src/models/User');
const Course = require('../server/src/models/Course');
const Department = require('../server/src/models/Department');
const courseService = require('../server/src/services/courseService');
const authService = require('../server/src/services/authService');

const PROFESSOR = {
  name: 'Pradeep Kundu',
  email: 'pradeep.kundu@iiti.ac.in'
};

const COURSE = {
  courseCode: 'ME217',
  courseName: 'INDUSTRIAL DATA ANALYTICS',
  semester: 5,
  section: 'A',
  department: 'ME',
  room: 'L03'
};

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

const main = async () => {
  await db.connect();

  // A random one-time password is generated (never a guessable course-code
  // pattern) and printed once below; the professor must change it at sign-in.
  let temporaryPassword = null;
  let professor = await User.findOne({ email: PROFESSOR.email }).select('+passwordHash');
  if (!professor) {
    temporaryPassword = authService.generateTemporaryPassword();
    professor = await User.create({
      name: PROFESSOR.name,
      email: PROFESSOR.email,
      role: 'professor',
      department: COURSE.department,
      passwordHash: await authService.hashPassword(temporaryPassword),
      mustChangePassword: true
    });
    console.log(`Created professor: ${professor.name} (${professor.email})`);
  } else {
    console.log(`Professor exists: ${professor.name} (${professor.email})`);
    if (!professor.passwordHash) {
      temporaryPassword = authService.generateTemporaryPassword();
      professor.passwordHash = await authService.hashPassword(temporaryPassword);
      professor.mustChangePassword = true;
      await professor.save();
      console.log('Assigned a one-time password (account had none).');
    }
  }

  for (const dept of DEPARTMENTS) {
    const existing = await Department.findOne({ code: dept.code });
    if (!existing) await Department.create(dept);
  }
  console.log(`Departments ready (${DEPARTMENTS.length}).`);

  const existing = await Course.findOne({
    courseCode: COURSE.courseCode,
    semester: COURSE.semester,
    section: COURSE.section
  });
  if (existing) {
    if (String(existing.professorId) !== String(professor._id) || existing.room !== COURSE.room || !existing.department) {
      existing.professorId = professor._id;
      existing.room = COURSE.room;
      if (!existing.department) existing.department = COURSE.department;
      await existing.save();
    }
    console.log(`Course exists: ${COURSE.courseCode} - ${COURSE.courseName} (room ${existing.room})`);
  } else {
    // Created through the service; the course stores the professor assignment.
    await courseService.create({ ...COURSE, professorId: professor._id }, null);
    console.log(`Created course: ${COURSE.courseCode} - ${COURSE.courseName} (room ${COURSE.room})`);
  }
  console.log('\nProfessor login:');
  console.log(`  email:    ${PROFESSOR.email}`);
  if (temporaryPassword) {
    console.log(`  password: ${temporaryPassword}`);
    console.log('  (one-time password — the professor must change it at first sign-in)');
  } else {
    console.log('  password: unchanged (set previously; reset via the admin UI if unknown)');
  }
  console.log('\nStudent flow: any @iiti.ac.in email + a password of 8+ characters.');
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.disconnect());
