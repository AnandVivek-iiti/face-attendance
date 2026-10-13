const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorizeRole = require('../middleware/authorizeRole');
const validate = require('../middleware/validate');
const schemas = require('../utils/validation');
const controller = require('../controllers/enrollmentRequest.controller');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate);

router.get('/', authorizeRole(ROLES.PROFESSOR), controller.list);
router.post('/:id/approve', authorizeRole(ROLES.PROFESSOR), validate({ body: schemas.reviewEnrollmentRequest }), controller.approve);
router.post('/:id/reject', authorizeRole(ROLES.PROFESSOR), validate({ body: schemas.reviewEnrollmentRequest }), controller.reject);

module.exports = router;
