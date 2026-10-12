const db = require('../server/src/config/db');
const User = require('../server/src/models/User');
const authService = require('../server/src/services/authService');
const { ROLES } = require('../server/src/config/constants');

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key.startsWith('--') || argv[index + 1] === undefined) throw new Error(`Invalid argument: ${key}`);
    args[key.slice(2)] = argv[index + 1];
  }
  return args;
};

const main = async () => {
  const { name, email, password, role, 'student-id': studentId } = parseArgs(process.argv.slice(2));
  if (!name || !email || !password || !role) {
    throw new Error('Usage: --name <name> --email <email> --password <password> --role <admin|professor|student> [--student-id <id>]');
  }
  if (!Object.values(ROLES).includes(role)) throw new Error(`role must be one of ${Object.values(ROLES).join(', ')}`);
  if (password.length < 8) throw new Error('password must be at least 8 characters');
  if (studentId && role !== ROLES.STUDENT) throw new Error('--student-id is only valid for the student role');

  await db.connect();
  const user = await User.create({
    name,
    email,
    role,
    passwordHash: await authService.hashPassword(password),
    studentId
  });
  console.log(`Created ${user.role} ${user.email} (${user._id})`);
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.disconnect());
