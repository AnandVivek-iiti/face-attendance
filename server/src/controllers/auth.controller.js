const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const emailService = require('../services/emailService');
const { googleEnabled } = require('../middleware/googleAuth');
const { success } = require('../utils/response');

// Where the browser lands after the email round-trip; mirrors the Google flow.
const clientOrigin = env.clientOrigins[0] || 'http://localhost:5173';
const loginRedirect = (params) => `${clientOrigin}/login?${new URLSearchParams(params).toString()}`;

const login = asyncHandler(async (req, res) => success(res, await authService.login(req.body)));

// Public: lets the client decide whether to render the "Sign in with Google" button and the "email me a link" option without seeing any...
const config = asyncHandler(async (req, res) =>
  success(res, { googleEnabled, emailEnabled: emailService.isConfigured() })
);

// Returns the account behind the current bearer token.
const me = asyncHandler(async (req, res) => success(res, { user: req.user }));

const changePassword = asyncHandler(async (req, res) =>
  success(res, await authService.changePassword(req.user, req.body))
);

const updateProfile = asyncHandler(async (req, res) =>
  success(res, await authService.updateProfile(req.user, req.body))
);

// Public: a professor asks to be emailed a one-time sign-in link.
const requestMagicLink = asyncHandler(async (req, res) => {
  const result = await authService.requestMagicLink(req.body.email);
  // `delivered` lets the client say "could not send" instead of always claiming success.
  return success(res, { sent: true, delivered: Boolean(result.delivered) });
});

// The link in the email points here.
const verifyEmail = asyncHandler(async (req, res) => {
  let session;
  try {
    session = await authService.verifyEmailToken(req.query.token);
  } catch {
    return res.redirect(loginRedirect({ error: 'verify_invalid' }));
  }
  // The token travels in the URL, so make sure nothing keeps a copy of it.
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  return res.redirect(loginRedirect({ token: session.token }));
});

module.exports = { login, config, me, changePassword, updateProfile, requestMagicLink, verifyEmail };
