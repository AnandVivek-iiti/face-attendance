const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const hashPassword = (password) => bcrypt.hash(password, 12);

const login = async ({ email, password }) => {
  const user = await User.findOne({ email }).select('+passwordHash');
  const passwordMatches = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !passwordMatches) {
    throw new AppError('Invalid email or password', 401, { code: 'INVALID_CREDENTIALS' });
  }
  const token = jwt.sign({ role: user.role }, env.jwtSecret, {
    subject: String(user._id),
    expiresIn: env.jwtExpiresIn,
    algorithm: 'HS256'
  });
  return { token, user: user.toJSON() };
};

module.exports = { login, hashPassword };
