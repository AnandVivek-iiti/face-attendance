const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const env = require('../config/env');
const User = require('../models/User');
const authService = require('../services/authService');
const { IIIT_EMAIL_DOMAIN, ROLES } = require('../config/constants');

const { googleClientId, googleClientSecret, googleCallbackUrl } = env;
const googleEnabled = Boolean(googleClientId && googleClientSecret);

// Where the browser should land after the Google round-trip. Reused for both the
// success token hand-off and the failure redirect.
const clientOrigin = env.clientOrigins[0] || 'http://localhost:5173';
const loginRedirect = (params) =>
  `${clientOrigin}/login?${new URLSearchParams(params).toString()}`;

// Errors the user can act on are shown as-is; anything else is logged and the
// browser only sees a generic code (never internal error text).
class GoogleLoginError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GoogleLoginError';
    this.code = code;
  }
}

let initialized = false;

// The strategy only ever runs when both credentials are present, and registering
// it more than once (multiple createApp() calls in tests) is a no-op.
const initializeGooglePassport = () => {
  if (!googleEnabled || initialized) return;
  initialized = true;

  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientId,
        clientSecret: googleClientSecret,
        callbackURL: googleCallbackUrl,
        passReqToCallback: true
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const primary = profile.emails?.[0];
          const email = String(primary?.value || '').trim().toLowerCase();
          const displayName = profile.displayName || '';

          if (!email) throw new GoogleLoginError('google_no_email', 'Google account did not share an email address');

          // An unverified address proves nothing about who owns it; accepting it
          // would let someone sign in as any @iiti.ac.in user.
          const verified = primary?.verified ?? profile._json?.email_verified;
          if (verified !== true && verified !== 'true') {
            throw new GoogleLoginError('google_unverified_email', 'Your Google email address is not verified');
          }

          // Only the institutional domain may hold an account. Professors and
          // admins are provisioned by an admin, so an unknown address becomes a
          // student - exactly like the password first-login path.
          if (!authService.isIitiEmail(email)) {
            throw new GoogleLoginError('google_wrong_domain', `Use your @${IIIT_EMAIL_DOMAIN} Google account`);
          }

          let user = await User.findOne({ email });
          if (!user) {
            try {
              user = await User.create({
                name: displayName || email.split('@')[0],
                email,
                role: ROLES.STUDENT
              });
            } catch (error) {
              if (error && error.code !== 11000) throw error;
              user = await User.findOne({ email });
            }
          }
          if (!user) throw new GoogleLoginError('google_failed', 'Could not sign you in');

          const token = authService.issueToken(user);
          return done(null, { token, user: user.toJSON() });
        } catch (error) {
          return done(error);
        }
      }
    )
  );
};

// Kicks off the redirect to Google. If it is not configured, send the user back
// to the login page with a readable error instead of a dead route.
const authenticateGoogle = (req, res, next) =>
  googleEnabled
    ? passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false,
        // Hint only (the server still enforces the domain on the way back).
        hd: IIIT_EMAIL_DOMAIN,
        prompt: 'select_account'
      })(req, res, next)
    : res.redirect(loginRedirect({ error: 'google_not_configured' }));

// Uses the custom-callback form so a failure becomes a redirect back to the
// login page. With only failureRedirect, an error thrown by the strategy was
// passed to the error handler and the browser got a raw JSON 500.
const authenticateGoogleCallback = (req, res, next) => {
  if (!googleEnabled) return res.redirect(loginRedirect({ error: 'google_not_configured' }));
  return passport.authenticate('google', { session: false }, (error, result) => {
    if (error) {
      if (error instanceof GoogleLoginError) return res.redirect(loginRedirect({ error: error.code }));
      console.error('Google sign-in failed', error.message);
      return res.redirect(loginRedirect({ error: 'google_failed' }));
    }
    if (!result) return res.redirect(loginRedirect({ error: 'google_failed' }));
    req.user = result;
    return next();
  })(req, res, next);
};

// Runs after a successful callback: hand the JWT to the client, which exchanges
// it for the user via GET /api/auth/me.
const googleCallback = (req, res) => {
  const token = req.user?.token;
  if (!token) return res.redirect(loginRedirect({ error: 'google_failed' }));
  // The token travels in the URL, so make sure nothing keeps a copy of it.
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  return res.redirect(loginRedirect({ token }));
};

module.exports = {
  initializeGooglePassport,
  authenticateGoogle,
  authenticateGoogleCallback,
  googleCallback,
  googleEnabled
};
