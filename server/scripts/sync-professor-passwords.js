
const db = require('../src/config/db');
const User = require('../src/models/User');
const Course = require('../src/models/Course');
const authService = require('../src/services/authService');
const { ROLES, professorPasswordFor } = require('../src/config/constants');

const dryRun = process.argv.includes('--dry-run');

// Professors sign in with the password derived from their first course:
// IIT@INDORE#<COURSE CODE>. This (re)applies that rule to existing accounts, e.g.
// ones created before the rule existed. Run with --dry-run first.
const main = async () => {
  await db.connect();
  const professors = await User.find({ role: ROLES.PROFESSOR }).select('name email passwordSetByCourse');

  let changed = 0;
  for (const professor of professors) {
    const course = await Course.findOne({ professorId: professor._id })
      .sort({ createdAt: 1, courseCode: 1 })
      .select('courseCode');

    if (!course) {
      console.log(`  ${professor.email}: no course assigned, skipped (Google sign-in still works)`);
      continue;
    }

    const password = professorPasswordFor(course.courseCode);
    if (professor.passwordSetByCourse === course.courseCode) {
      console.log(`  ${professor.email}: already ${password}`);
      continue;
    }

    if (dryRun) {
      console.log(`  ${professor.email}: would set ${password}`);
    } else {
      await User.updateOne(
        { _id: professor._id },
        {
          $set: {
            passwordHash: await authService.hashPassword(password),
            passwordSetByCourse: course.courseCode
          }
        }
      );
      console.log(`  ${professor.email}: ${password}`);
    }
    changed += 1;
  }

  console.log(`Done${dryRun ? ' (dry run)' : ''}. ${changed} account(s) ${dryRun ? 'to update' : 'updated'}.`);
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.disconnect());
