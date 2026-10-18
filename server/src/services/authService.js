const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const emailService = require('./emailService');
const { IIIT_EMAIL_DOMAIN, ROLES } = require('../config/constants');

// Compared against when the account does not exist (or has no password) so the response time does not reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const hashPassword = (password) => bcrypt.hash(password, 12);

// 16 URL-safe characters (~96 bits).
const generateTemporaryPassword = () => crypto.randomBytes(12).toString('base64url');

const issueToken = (user) =>
  jwt.sign({ role: user.role }, env.jwtSecret, {
    subject: String(user._id),
    expiresIn: env.jwtExpiresIn,
    algorithm: 'HS256'
  });

const isIitiEmail = (email) => String(email || '').toLowerCase().endsWith(`@${IIIT_EMAIL_DOMAIN}`);

const invalidCredentials = () => new AppError('Invalid email or password', 401, { code: 'INVALID_CREDENTIALS' });

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// 256-bit, URL-safe.
const generateVerificationToken = () => crypto.randomBytes(32).toString('base64url');

const verifyLinkError = () => new AppError('This link is invalid or has expired', 400, { code: 'VERIFY_INVALID' });

// Issues (or replaces) a single one-time sign-in / verification link for a user.
const issueEmailVerification = async (user) => {
  const rawToken = generateVerificationToken();
  const expiresAt = new Date(Date.now() + env.emailLinkTtlMinutes * 60 * 1000);
  user.emailVerificationTokenHash = hashToken(rawToken);
  user.emailVerificationExpiresAt = expiresAt;
  await user.save();
  return { rawToken, link: emailService.verificationLink(rawToken), expiresAt };
};

// Consumes a one-time link: marks the address verified and clears the token so it cannot be replayed.
const consumeEmailVerification = async (rawToken) => {
  if (typeof rawToken !== 'string' || rawToken.length === 0 || rawToken.length > 512) throw verifyLinkError();
  const user = await User.findOne({ emailVerificationTokenHash: hashToken(rawToken) }).select(
    '+emailVerificationTokenHash +emailVerificationExpiresAt'
  );
  if (!user || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt.getTime() < Date.now()) {
    throw verifyLinkError();
  }
  user.emailVerified = true;
  user.emailVerificationTokenHash = null;
  user.emailVerificationExpiresAt = null;
  await user.save();
  return user;
};

// Public "email me a sign-in link" entry point.
const requestMagicLink = async (email) => {
  const normalized = String(email || '').trim().toLowerCase();
  const user = await User.findOne({ email: normalized, role: ROLES.PROFESSOR });
  if (!user) return { issued: false };
  const { link } = await issueEmailVerification(user);
  const delivered = await emailService.sendMagicLink({ to: user.email, name: user.name, link });
  return { issued: true, link, delivered };
};

// Completes the email round-trip: verifies the link and starts a session.
const verifyEmailToken = async (rawToken) => {
  const user = await consumeEmailVerification(rawToken);
  return { token: issueToken(user), user: user.toJSON() };
};

// Single sign-in for every role.
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

  // A professor may only change their password once they have proven ownership of the address by opening the emailed link.
  if (user.role === ROLES.PROFESSOR && !user.emailVerified) {
    throw new AppError('Verify your email address before changing your password', 403, { code: 'EMAIL_NOT_VERIFIED' });
  }

  // Accounts that signed in with Google have no password yet; the live token is proof enough to set one.
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

// A professor edits their own name/department.
const updateProfile = async (actor, { name, department }) => {
  const user = await User.findById(actor._id);
  if (!user) throw new AppError('Account not found', 404, { code: 'USER_NOT_FOUND' });
  if (user.role === ROLES.PROFESSOR && !user.emailVerified) {
    throw new AppError('Verify your email address before updating your profile', 403, { code: 'EMAIL_NOT_VERIFIED' });
  }
  if (name !== undefined) user.name = name;
  if (department !== undefined) user.department = department;
  await user.save();
  return { user: user.toJSON() };
};

module.exports = {
  login,
  changePassword,
  updateProfile,
  requestMagicLink,
  verifyEmailToken,
  issueEmailVerification,
  hashPassword,
  generateTemporaryPassword,
  isIitiEmail,
  issueToken
};
