const express = require('express');

const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/students', require('./student.routes'));
router.use('/courses', require('./course.routes'));
router.use('/attendance', require('./attendance.routes'));
router.use('/enrollment-requests', require('./enrollmentRequest.routes'));
router.use('/departments', require('./department.routes'));
router.use('/files', require('./files.routes'));

module.exports = router;
