
const db = require('../server/src/config/db');
const User = require('../server/src/models/User');
const Course = require('../server/src/models/Course');
const Department = require('../server/src/models/Department');
const courseService = require('../server/src/services/courseService');
const authService = require('../server/src/services/authService');
const { professorPasswordFor } = require('../server/src/config/constants');

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

  let professor = await User.findOne({ email: PROFESSOR.email });
  if (!professor) {
    professor = await User.create({
      name: PROFESSOR.name,
      email: PROFESSOR.email,
      role: 'professor',
      department: COURSE.department,
      passwordSetByCourse: null
    });
    console.log(`Created professor: ${professor.name} (${professor.email})`);
  } else {
    console.log(`Professor exists: ${professor.name} (${professor.email})`);
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
  // ME217 is the designated test course: make sure its professor's password is
  // the course-derived one, even if the course predates this logic.
  const coursePassword = professorPasswordFor(COURSE.courseCode);
  const stored = await User.findOne({ email: PROFESSOR.email }).select('+passwordHash passwordSetByCourse');
  if (stored.passwordSetByCourse !== COURSE.courseCode) {
    await User.updateOne(
      { _id: professor._id },
      {
        $set: {
          passwordHash: await authService.hashPassword(coursePassword),
          passwordSetByCourse: COURSE.courseCode
        }
      }
    );
    console.log(`Set professor password to ${coursePassword}`);
  }

  console.log('\nProfessor login:');
  console.log(`  email:    ${PROFESSOR.email}`);
  console.log(`  password: ${coursePassword}`);
  console.log('  (derived from the course code; the admin can share it directly)');
  console.log('\nStudent flow: any @iiti.ac.in email + a password of 8+ characters.');
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.disconnect());
