const AppError = require('../utils/AppError');

const authorizeRole =
  (...roles) =>
  (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) return next();
    return next(new AppError('You do not have permission to perform this action', 403, { code: 'FORBIDDEN' }));
  };

module.exports = authorizeRole;
