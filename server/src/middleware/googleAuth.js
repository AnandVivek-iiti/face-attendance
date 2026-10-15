const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { IIIT_EMAIL_DOMAIN, ROLES } = require('../config/constants');

const googleClientID = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleCallbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback';

let googleEnabled = false;
try {
  if (googleClientID && googleClientSecret) {
    googleEnabled = true;
  }
} catch {}

const initializeGooglePassport = () => {
  if (googleEnabled) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleClientID,
          clientSecret: googleClientSecret,
          callbackURL: googleCallbackURL,
          passReqToCallback: true
        },
        async (req, accessToken, refreshToken, profile, done) => {
          try {
            const googleId = profile.id;
            const email = String(profile.emails?.[0]?.value || '').trim().toLowerCase();
            const displayName = profile.displayName || '';

            if (!email) {
              return done(new Error('Google email not provided'), false);
            }

            // Check if user already exists by email
            let user = await User.findOne({ email }).select('+passwordHash').lean();

            if (user) {
              // User exists - issue token
              const token = jwt.sign(
                { role: user.role, sub: user._id },
                env.jwtSecret,
                { expiresIn: env.jwtExpiresIn || '8h' }
              );
              return done(null, { user, token });
            }

            // New user - auto-provision as student with @iiti.ac.in email domain check
            const isIiti = email.endsWith(`@${IIIT_EMAIL_DOMAIN}`);

            const baseName = email.split('@')[0];

            user = await User.create({
              name: displayName || baseName,
              email,
              passwordHash: undefined, // No local password; Google is the auth method
              role: isIiti ? ROLES.STUDENT : ROLES.STUDENT,
              studentId: undefined
            });

            const token = jwt.sign(
              { role: user.role, sub: user._id },
              env.jwtSecret,
              { expiresIn: env.jwtExpiresIn || '8h' }
            );

            done(null, { user, token });
          } catch (error) {
            done(error, false);
          }
        }
      )
    );
  }
};

const authenticateGoogle = () => passport.authenticate('google', { scope: ['profile', 'email'] });

const googleCallbackHandler = () => passport.authenticate('google', { session: false });

module.exports = { initializeGooglePassport, authenticateGoogle, googleCallbackHandler, googleEnabled };