const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorizeRole = require('../middleware/authorizeRole');
const validate = require('../middleware/validate');
const schemas = require('../utils/validation');
const controller = require('../controllers/course.controller');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate);

router.get('/', authorizeRole(ROLES.ADMIN, ROLES.PROFESSOR), controller.list);
router.post('/', authorizeRole(ROLES.ADMIN), validate({ body: schemas.createCourse }), controller.create);
router.get('/:id', authorizeRole(ROLES.ADMIN, ROLES.PROFESSOR), controller.getOne);

module.exports = router;
