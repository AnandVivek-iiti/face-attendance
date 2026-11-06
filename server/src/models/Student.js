const mongoose = require('mongoose');

const upperTrim = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

const studentSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, unique: true, trim: true },
    rollNumber: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    department: { type: String, required: true, trim: true },
    semester: { type: Number, required: true, min: 1, max: 12 },
    section: { type: String, required: true, set: upperTrim },
    // Legacy filesystem path retained for backward compatibility during migration.
    registeredImage: { type: String, default: null },
    // Current GridFS image plus append-only references to previously registered face photos.
    registeredImageFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
    registeredFaceImages: {
      type: [{
        fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
        filename: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true },
        source: { type: String, default: 'registered' },
        uploadedAt: { type: Date, default: Date.now }
      }],
      default: []
    },
    // Reference face vectors accumulated over time.
    faceEmbeddings: { type: [[Number]], select: false, default: [] },
    // The insightface pack that produced faceEmbeddings.
    embeddingModel: { type: String, default: null },
    hasFaceEmbedding: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    // True while the ID/name were generated automatically (bulk face enrollment).
    autoEnrolled: { type: Boolean, default: false }
  },
  { timestamps: true }
);

studentSchema.index({ semester: 1, section: 1, active: 1 });

studentSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.faceEmbeddings;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Student', studentSchema);
