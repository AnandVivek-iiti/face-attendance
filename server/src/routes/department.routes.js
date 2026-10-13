const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorizeRole = require('../middleware/authorizeRole');
const validate = require('../middleware/validate');
const schemas = require('../utils/validation');
const controller = require('../controllers/department.controller');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate);

router.get('/', authorizeRole(ROLES.ADMIN, ROLES.PROFESSOR, ROLES.STUDENT), controller.list);
router.post('/', authorizeRole(ROLES.ADMIN), validate({ body: schemas.createDepartment }), controller.create);
router.put('/:id', authorizeRole(ROLES.ADMIN), validate({ body: schemas.updateDepartment }), controller.update);
router.delete('/:id', authorizeRole(ROLES.ADMIN), controller.remove);

module.exports = router;
