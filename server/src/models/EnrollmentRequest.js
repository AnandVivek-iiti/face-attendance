const mongoose = require('mongoose');
const { ENROLLMENT_REQUEST_STATUS } = require('../config/constants');

const enrollmentRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    rollNumber: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    year: { type: Number, required: true, min: 1, max: 6 },
    semester: { type: Number, required: true, min: 1, max: 12 },
    department: { type: String, required: true, trim: true },
    imagePath: { type: String, required: true },
    status: { type: String, enum: Object.values(ENROLLMENT_REQUEST_STATUS), default: ENROLLMENT_REQUEST_STATUS.PENDING },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    note: { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

// One open request per student per course.
enrollmentRequestSchema.index({ userId: 1, courseId: 1, status: 1 });

enrollmentRequestSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('EnrollmentRequest', enrollmentRequestSchema);
