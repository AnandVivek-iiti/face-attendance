const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { isObjectId } = require('../utils/objectId');

const invalidToken = () => new AppError('Invalid or expired token', 401, { code: 'INVALID_TOKEN' });

const authenticate = asyncHandler(async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new AppError('Authentication required', 401, { code: 'AUTH_REQUIRED' });
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch (error) {
    throw invalidToken();
  }
  if (!isObjectId(payload.sub)) throw invalidToken();

  const user = await User.findById(payload.sub).select('name email role studentId').lean();
  if (!user) throw invalidToken();

  req.user = {
    _id: user._id,
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    studentId: user.studentId || null
  };
  next();
});

module.exports = authenticate;
