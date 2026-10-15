const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const { googleEnabled } = require('../middleware/googleAuth');
const { success } = require('../utils/response');

const login = asyncHandler(async (req, res) => success(res, await authService.login(req.body)));

const google = asyncHandler(async (req, res) => {
  if (!googleEnabled) {
    return res.status(503).json({
      success: false,
      message: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.',
      code: 'GOOGLE_NOT_CONFIGURED'
    });
  }
  // req.user is set by passport after the Google callback
  const { user, token } = req.user;
  return success(res, { token, user, registered: user.role === ROLES.STUDENT && user.passwordHash === undefined });
});

module.exports = { login, google };