const express = require('express');
const path = require('path');
const fs = require('fs');
const authenticate = require('../middleware/authenticate');
const authorizeRole = require('../middleware/authorizeRole');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const fileAccessService = require('../services/fileAccessService');
const { ROLES } = require('../config/constants');

const router = express.Router();
const root = path.resolve(env.storageRoot);

const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const notFound = () => new AppError('File not found', 404, { code: 'FILE_NOT_FOUND' });

// <img> tags and Image() loaders cannot send an Authorization header, so the
// client appends ?token=<jwt> to file URLs. Accept it here (and only here),
// then run the normal authenticate chain - same verification, no weakening.
// NOTE: a token in a URL can end up in access logs and browser history, so keep
// proxy/access logs from recording query strings for /api/files.
const tokenFromQuery = (req, _res, next) => {
  if (!req.headers.authorization && typeof req.query.token === 'string' && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
};

// A regular expression (rather than '/*') behaves the same on Express 4 and 5,
// where the wildcard syntax is different and '/*' is rejected at startup on 5.
router.get(
  /^\/(.+)$/,
  tokenFromQuery,
  authenticate,
  authorizeRole(ROLES.PROFESSOR, ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    // Express has already URL-decoded the capture; decoding again would let
    // "%252e%252e" turn into "..". Only the strict allowlist below is trusted.
    const relative = String((req.params && req.params[0]) || '');
    const info = fileAccessService.classify(relative);
    if (!info) throw notFound();

    // Same 404 whether the file is missing or merely not theirs, so the route
    // cannot be used to probe which photos exist.
    if (!(await fileAccessService.canAccess(req.user, relative, info))) throw notFound();

    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(root + path.sep)) throw notFound();

    let real;
    try {
      real = await fs.promises.realpath(absolute);
      const stat = await fs.promises.stat(real);
      if (!stat.isFile()) throw notFound();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw notFound();
    }
    // A symlink planted inside storage must not lead outside it.
    const realRoot = await fs.promises.realpath(root);
    if (!real.startsWith(realRoot + path.sep)) throw notFound();

    const type = CONTENT_TYPES[path.extname(real).toLowerCase()];
    if (!type) throw notFound();

    res.set('Content-Type', type);
    res.set('Cache-Control', 'private, max-age=3600');
    res.set('Content-Disposition', 'inline');
    await new Promise((resolve, reject) => {
      res.sendFile(real, { dotfiles: 'deny' }, (error) => (error ? reject(error) : resolve()));
    });
  })
);

module.exports = router;
