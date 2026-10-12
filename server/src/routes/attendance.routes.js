const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorizeRole = require('../middleware/authorizeRole');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { sessionUploadGuard } = require('../middleware/uploadGuards');
const schemas = require('../utils/validation');
const controller = require('../controllers/attendance.controller');
const { ROLES } = require('../config/constants');

const router = express.Router();
const professor = authorizeRole(ROLES.PROFESSOR);

router.use(authenticate);

router.post('/sessions', professor, validate({ body: schemas.createSession }), controller.createSession);
router.post('/sessions/:id/images', professor, sessionUploadGuard, upload.attendanceImages, controller.addImages);
router.post('/sessions/:id/analyze', professor, controller.analyze);
router.get('/sessions/:id', authorizeRole(ROLES.PROFESSOR, ROLES.ADMIN), controller.getSession);
router.put(
  '/sessions/:id/records/:studentId',
  professor,
  validate({ body: schemas.updateRecord }),
  controller.updateRecord
);
router.post('/sessions/:id/finalize', professor, controller.finalize);

router.get('/history', validate({ query: schemas.history }), controller.history);

module.exports = router;
