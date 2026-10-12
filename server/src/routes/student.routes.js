const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorizeRole = require('../middleware/authorizeRole');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { studentUploadGuard } = require('../middleware/uploadGuards');
const schemas = require('../utils/validation');
const controller = require('../controllers/student.controller');
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
router.get('/:id', authorizeRole(ROLES.ADMIN, ROLES.PROFESSOR, ROLES.STUDENT), controller.getOne);
router.put('/:id', authorizeRole(ROLES.ADMIN), validate({ body: schemas.updateStudent }), controller.update);
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
