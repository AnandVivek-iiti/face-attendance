const express = require('express');

const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/students', require('./student.routes'));
router.use('/courses', require('./course.routes'));
router.use('/attendance', require('./attendance.routes'));

module.exports = router;
