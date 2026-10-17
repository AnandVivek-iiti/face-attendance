const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { IIIT_EMAIL_DOMAIN, ROLES } = require('../config/constants');

// Compared against when the account does not exist (or has no password) so the
// response time does not reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const hashPassword = (password) => bcrypt.hash(password, 12);

// 16 URL-safe characters (~96 bits). Shown once to the admin who provisions the
// account; the professor is forced to replace it at first sign-in.
const generateTemporaryPassword = () => crypto.randomBytes(12).toString('base64url');

const issueToken = (user) =>
  jwt.sign({ role: user.role }, env.jwtSecret, {
    subject: String(user._id),
    expiresIn: env.jwtExpiresIn,
    algorithm: 'HS256'
  });

const isIitiEmail = (email) => String(email || '').toLowerCase().endsWith(`@${IIIT_EMAIL_DOMAIN}`);

const invalidCredentials = () => new AppError('Invalid email or password', 401, { code: 'INVALID_CREDENTIALS' });

/**
 * Single sign-in for every role.
 *
 * Students may self-register on first login when ALLOW_SELF_REGISTRATION is on
 * (default off in production): the password they type becomes their password.
 * That mode cannot prove the person owns the address, so production deployments
 * should leave it off and let students use Google sign-in instead.
 * Professors and admins are always provisioned by an admin and never created here.
 */
const login = async ({ email, password }) => {
  const normalized = String(email || '').trim().toLowerCase();
  if (!isIitiEmail(normalized)) {
    throw new AppError(`Use your @${IIIT_EMAIL_DOMAIN} email address`, 400, { code: 'INVALID_EMAIL_DOMAIN' });
  }
  if (!password || password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400, { code: 'WEAK_PASSWORD' });
  }

  const user = await User.findOne({ email: normalized }).select('+passwordHash');

  if (!user) {
    if (!env.allowSelfRegistration) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw invalidCredentials();
    }
    try {
      const created = await User.create({
        name: normalized.split('@')[0],
        email: normalized,
        passwordHash: await hashPassword(password),
        role: ROLES.STUDENT
      });
      return { token: issueToken(created), user: created.toJSON(), registered: true };
    } catch (error) {
      // Two first-logins for the same address raced; the loser must not get in.
      if (error && error.code === 11000) throw invalidCredentials();
      throw error;
    }
  }

  // Google-only accounts have no password; keep the timing the same and refuse.
  const matches = await bcrypt.compare(password, user.passwordHash || DUMMY_HASH);
  if (!user.passwordHash || !matches) throw invalidCredentials();
  return { token: issueToken(user), user: user.toJSON(), registered: false };
};

const changePassword = async (actor, { currentPassword, newPassword }) => {
  const user = await User.findById(actor._id).select('+passwordHash');
  if (!user) throw new AppError('Account not found', 404, { code: 'USER_NOT_FOUND' });

  // Accounts that signed in with Google have no password yet; the live token is
  // proof enough to set one. Everyone else must know the current password.
  if (user.passwordHash) {
    const ok = currentPassword && (await bcrypt.compare(currentPassword, user.passwordHash));
    if (!ok) throw new AppError('Current password is incorrect', 401, { code: 'INVALID_CREDENTIALS' });
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new AppError('Choose a password different from the current one', 400, { code: 'PASSWORD_UNCHANGED' });
    }
  }

  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  user.passwordChangedAt = new Date();
  await user.save();
  // Older tokens stop working; hand back a fresh one so this session continues.
  return { token: issueToken(user), user: user.toJSON() };
};

module.exports = {
  login,
  changePassword,
  hashPassword,
  generateTemporaryPassword,
  isIitiEmail,
  issueToken
};
