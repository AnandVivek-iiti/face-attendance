const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { IIIT_EMAIL_DOMAIN, ROLES } = require('../config/constants');

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const hashPassword = (password) => bcrypt.hash(password, 12);

const issueToken = (user) =>
  jwt.sign({ role: user.role }, env.jwtSecret, {
    subject: String(user._id),
    expiresIn: env.jwtExpiresIn,
    algorithm: 'HS256'
  });

const isIitiEmail = (email) => String(email || '').toLowerCase().endsWith(`@${IIIT_EMAIL_DOMAIN}`);

/**
 * Single sign-in for every role.
 *
 * Students self-register on first login: their @iiti.ac.in address is the
 * identity, and the password they type becomes their real password (hashed).
 * Anyone who later presents that same address + password signs in normally.
 * Professors and admins are always provisioned by an admin, so an unknown
 * professor/admin address is rejected rather than silently created.
 */
const login = async ({ email, password }) => {
  const normalized = String(email || '').trim().toLowerCase();
  if (!isIitiEmail(normalized)) {
    throw new AppError(`Use your @${IIIT_EMAIL_DOMAIN} email address`, 400, { code: 'INVALID_EMAIL_DOMAIN' });
  }
  if (!password || password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400, { code: 'WEAK_PASSWORD' });
  }

  let user = await User.findOne({ email: normalized }).select('+passwordHash');

  if (!user) {
    // Unknown student address -> provision the account (first login sets the password).
    // Unknown professor/admin address -> refuse; only admin can create those.
    user = await User.create({
      name: normalized.split('@')[0],
      email: normalized,
      passwordHash: await hashPassword(password),
      role: ROLES.STUDENT
    });
    return { token: issueToken(user), user: user.toJSON(), registered: true };
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError('Invalid email or password', 401, { code: 'INVALID_CREDENTIALS' });
  }
  return { token: issueToken(user), user: user.toJSON(), registered: false };
};

module.exports = { login, hashPassword, isIitiEmail };
