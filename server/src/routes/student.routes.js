const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorizeRole = require('../middleware/authorizeRole');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { studentUploadGuard } = require('../middleware/uploadGuards');
const schemas = require('../utils/validation');
const controller = require('../controllers/student.controller');
const enrollmentRequestController = require('../controllers/enrollmentRequest.controller');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate);

router.get(
  '/',
  authorizeRole(ROLES.ADMIN, ROLES.PROFESSOR),
  validate({ query: schemas.listStudents }),
  controller.list
);
router.post('/', authorizeRole(ROLES.ADMIN), validate({ body: schemas.createStudent }), controller.create);

// Student self-service. Registered before /:id so "profile" is not read as an id.
// multer must run BEFORE validate: on a multipart request req.body is empty until
// multer has parsed it, so validating first rejects every request with a 400. It
// also answers while the browser is still sending the upload, which the dev proxy
// surfaces as ERR_CONNECTION_RESET.
router.post(
  '/profile',
  authorizeRole(ROLES.STUDENT),
  ...upload.profileImage,
  validate({ body: schemas.studentProfile }),
  controller.profile
);
router.get('/attendance', authorizeRole(ROLES.STUDENT), controller.attendance);
router.get('/requests', authorizeRole(ROLES.STUDENT), enrollmentRequestController.listMine);
router.get('/profile', authorizeRole(ROLES.STUDENT), controller.myProfile);

router.get('/:id', authorizeRole(ROLES.ADMIN, ROLES.PROFESSOR, ROLES.STUDENT), controller.getOne);
router.put('/:id', authorizeRole(ROLES.ADMIN, ROLES.PROFESSOR), validate({ body: schemas.updateStudent }), controller.update);
router.delete('/:id', authorizeRole(ROLES.ADMIN), controller.remove);

router.post(
  '/:id/face',
  authorizeRole(ROLES.ADMIN),
  studentUploadGuard,
  ...upload.faceImage,
  controller.registerFace
);
router.post('/:id/face/embedding', authorizeRole(ROLES.ADMIN), controller.generateEmbedding);

module.exports = router;
