const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const { googleEnabled } = require('../middleware/googleAuth');
const { success } = require('../utils/response');

const login = asyncHandler(async (req, res) => success(res, await authService.login(req.body)));

// Public: lets the client decide whether to render the "Sign in with Google"
// button without ever seeing the OAuth secret.
const config = asyncHandler(async (req, res) => success(res, { googleEnabled }));

// Returns the account behind the current bearer token. Used to finish the Google
// hand-off, where the client receives a token (not a user) in the redirect.
const me = asyncHandler(async (req, res) => success(res, { user: req.user }));

const changePassword = asyncHandler(async (req, res) =>
  success(res, await authService.changePassword(req.user, req.body))
);

module.exports = { login, config, me, changePassword };
