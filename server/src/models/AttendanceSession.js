const mongoose = require('mongoose');
const { SESSION_STATUS } = require('../config/constants');

const imageSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  path: { type: String, required: true },
  originalName: { type: String, default: null },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now },
  quality: {
    status: { type: String, default: null },
    blurScore: { type: Number, default: null },
    brightnessScore: { type: Number, default: null },
    message: { type: String, default: null }
  }
});

const sessionSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    professorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    uploadedImages: { type: [imageSchema], default: [] },
    status: { type: String, enum: Object.values(SESSION_STATUS), default: SESSION_STATUS.DRAFT },
    totalStudents: { type: Number, default: 0 },
    presentCount: { type: Number, default: 0 },
    absentCount: { type: Number, default: 0 },
    needsReviewCount: { type: Number, default: 0 },
    analysis: { type: mongoose.Schema.Types.Mixed, default: null },
    failure: {
      code: { type: String, default: null },
      message: { type: String, default: null },
      at: { type: Date, default: null }
    },
    processingStartedAt: { type: Date, default: null },
    finalizedAt: { type: Date, default: null },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

sessionSchema.index({ courseId: 1, date: 1 });
sessionSchema.index({ professorId: 1, date: -1 });

module.exports = mongoose.model('AttendanceSession', sessionSchema);
