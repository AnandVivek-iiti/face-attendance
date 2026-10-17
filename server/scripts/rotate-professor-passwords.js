
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
