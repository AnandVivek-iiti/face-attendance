const express = require('express');
const path = require('path');
const fs = require('fs');
const authenticate = require('../middleware/authenticate');
const authorizeRole = require('../middleware/authorizeRole');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { ROLES } = require('../config/constants');

const router = express.Router();
const root = path.resolve(env.storageRoot);

// Allowlist the two folders that hold real uploads. Anything else is a 404
// even if it somehow resolved inside the storage root.
const ALLOWED_PREFIXES = ['attendance-images/', 'registered-faces/', 'profile-images/'];

// <img> tags and Image() loaders cannot send an Authorization header, so the
// client appends ?token=<jwt> to file URLs. Accept it here (and only here),
// then run the normal authenticate chain — same verification, no weakening.
const tokenFromQuery = (req, _res, next) => {
  if (!req.headers.authorization && typeof req.query.token === 'string' && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
};

router.get('/*', tokenFromQuery, authenticate, authorizeRole(ROLES.PROFESSOR, ROLES.ADMIN), (req, res, next) => {
  try {
    const relative = decodeURIComponent(req.params[0] || '');
    const normalized = relative.split(path.sep).join('/');
    if (!ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
      throw new AppError('File not found', 404, { code: 'FILE_NOT_FOUND' });
    }

    // Resolve, then confirm the result is still inside storage. Stops ../ escapes.
    const absolute = path.resolve(root, normalized);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) {
      throw new AppError('File not found', 404, { code: 'FILE_NOT_FOUND' });
    }

    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new AppError('File not found', 404, { code: 'FILE_NOT_FOUND' });
    }

    const ext = path.extname(absolute).toLowerCase();
    const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    const type = types[ext];
    if (!type) throw new AppError('File not found', 404, { code: 'FILE_NOT_FOUND' });

    res.set('Content-Type', type);
    res.set('Cache-Control', 'private, max-age=3600');
    res.sendFile(absolute, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
