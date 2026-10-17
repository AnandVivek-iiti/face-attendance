/**
 * One-off migration. Earlier versions set a professor's password to
 * "IIT@INDORE#<COURSE CODE>", which anyone who knows the course code (it is
 * public) and the professor's email can guess. This replaces every such password
 * with a random temporary one, forces a change at next sign-in, and revokes
 * tokens issued before now.
 *
 *   node scripts/rotate-professor-passwords.js --dry-run   # list who is affected
 *   node scripts/rotate-professor-passwords.js             # rotate
 *
 * The temporary passwords are printed once to this terminal. Hand each one to
 * its owner over a private channel; they are not stored anywhere readable.
 */
const db = require('../src/config/db');
const User = require('../src/models/User');
const authService = require('../src/services/authService');
const { ROLES } = require('../src/config/constants');

const dryRun = process.argv.includes('--dry-run');

const main = async () => {
  await db.connect();
  const legacy = await User.find({ role: ROLES.PROFESSOR, passwordSetByCourse: { $ne: null } }).select('name email');

  if (legacy.length === 0) {
    console.log('No professor accounts use a course-derived password.');
    return;
  }

  console.log(`${legacy.length} professor account(s) use a course-derived password${dryRun ? ' (dry run)' : ''}:`);
  for (const professor of legacy) {
    if (dryRun) {
      console.log(`  ${professor.email}`);
      continue;
    }
    const temporaryPassword = authService.generateTemporaryPassword();
    await User.updateOne(
      { _id: professor._id },
      {
        $set: {
          passwordHash: await authService.hashPassword(temporaryPassword),
          passwordSetByCourse: null,
          mustChangePassword: true,
          passwordChangedAt: new Date()
        }
      }
    );
    console.log(`  ${professor.email}  ${temporaryPassword}`);
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.disconnect());
