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
router.get('/available', authorizeRole(ROLES.ADMIN, ROLES.PROFESSOR, ROLES.STUDENT), controller.listAll);
// Registered before /:id so "professors" is not read as a course id.
router.get('/professors', authorizeRole(ROLES.ADMIN), controller.listProfessors);
router.post('/', authorizeRole(ROLES.ADMIN), validate({ body: schemas.createCourse }), controller.create);
router.get('/:id', authorizeRole(ROLES.ADMIN, ROLES.PROFESSOR), controller.getOne);
router.put('/:id', authorizeRole(ROLES.ADMIN), validate({ body: schemas.updateCourse }), controller.update);
router.delete('/:id', authorizeRole(ROLES.ADMIN), controller.remove);

// Admin provisions a professor and manages their access.
router.post('/professors', authorizeRole(ROLES.ADMIN), validate({ body: schemas.createProfessor }), controller.addProfessor);
router.put('/professors/:id', authorizeRole(ROLES.ADMIN), validate({ body: schemas.updateProfessor }), controller.updateProfessor);
router.delete('/professors/:id', authorizeRole(ROLES.ADMIN), controller.removeProfessor);
// Resend the sign-in link / regenerate a random password + link.
router.post('/professors/:id/invite', authorizeRole(ROLES.ADMIN), controller.inviteProfessor);
router.post('/professors/:id/regenerate', authorizeRole(ROLES.ADMIN), controller.regenerateProfessor);

module.exports = router;
