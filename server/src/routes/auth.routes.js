const express = require('express');
const rateLimit = require('express-rate-limit');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const schemas = require('../utils/validation');
const controller = require('../controllers/auth.controller');
const {
  authenticateGoogle,
  authenticateGoogleCallback,
  googleCallback
} = require('../middleware/googleAuth');

const router = express.Router();

const limited = (options) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many login attempts, try again later', code: 'RATE_LIMITED' },
    ...options
  });

// Per client IP: stops one machine hammering many accounts.
const loginLimiter = limited({ limit: 30 });

// Per target account: stops a distributed guess against one account. Only failed
// attempts count, so a real user who signs in correctly is never locked out.
const accountLimiter = limited({
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login:${String((req.body && req.body.email) || '').trim().toLowerCase().slice(0, 254)}`
});

const passwordLimiter = limited({ limit: 10, skipSuccessfulRequests: true });

router.get('/config', controller.config);
router.get('/me', authenticate, controller.me);
router.post('/login', loginLimiter, accountLimiter, validate({ body: schemas.login }), controller.login);
router.post(
  '/change-password',
  authenticate,
  passwordLimiter,
  validate({ body: schemas.changePassword }),
  controller.changePassword
);

router.get('/google', loginLimiter, authenticateGoogle);
router.get('/google/callback', loginLimiter, authenticateGoogleCallback, googleCallback);

module.exports = router;
