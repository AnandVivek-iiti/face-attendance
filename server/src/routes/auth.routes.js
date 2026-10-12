const express = require('express');
const rateLimit = require('express-rate-limit');
const validate = require('../middleware/validate');
const schemas = require('../utils/validation');
const controller = require('../controllers/auth.controller');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, try again later', code: 'RATE_LIMITED' }
});

router.post('/login', loginLimiter, validate({ body: schemas.login }), controller.login);

module.exports = router;
