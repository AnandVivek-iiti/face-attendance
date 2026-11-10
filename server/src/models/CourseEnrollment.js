const mongoose = require('mongoose');

// Which students are in which course. This, not semester/section, decides who a professor sees and who is on an attendance roster.
const ENROLLMENT_SOURCES = Object.freeze(['manual', 'request', 'face_assignment', 'migration']);

const courseEnrollmentSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    // Set false (instead of deleting) when a student leaves a course so the history stays explainable.
    active: { type: Boolean, default: true },
    source: { type: String, enum: ENROLLMENT_SOURCES, default: 'manual' },
    enrolledAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

courseEnrollmentSchema.index({ courseId: 1, studentId: 1 }, { unique: true });
courseEnrollmentSchema.index({ studentId: 1, active: 1 });

module.exports = mongoose.model('CourseEnrollment', courseEnrollmentSchema);
module.exports.ENROLLMENT_SOURCES = ENROLLMENT_SOURCES;
