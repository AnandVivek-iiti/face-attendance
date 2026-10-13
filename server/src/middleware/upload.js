const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const storageService = require('../services/storageService');
const { IMAGE_MIME_TYPES, LIMITS } = require('../config/constants');

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, storageService.dirs.temporary),
  filename: (req, file, callback) => callback(null, `${crypto.randomUUID()}.upload`)
});

const fileFilter = (req, file, callback) => {
  if (IMAGE_MIME_TYPES[file.mimetype]) return callback(null, true);
  return callback(new AppError('Only JPEG, PNG or WebP images are allowed', 400, { code: 'INVALID_FILE_TYPE' }));
};

const build = (files) => multer({ storage, fileFilter, limits: { fileSize: env.uploadMaxSize, files } });

const attendanceImages = build(LIMITS.IMAGES_PER_REQUEST).array('images', LIMITS.IMAGES_PER_REQUEST);

const faceImage = build(1).single('image');

const profileImage = build(1).single('image');

const singleToArray = (req, res, next) => {
  req.files = req.file ? [req.file] : [];
  next();
};

module.exports = { attendanceImages, faceImage: [faceImage, singleToArray], profileImage: [profileImage, singleToArray] };
