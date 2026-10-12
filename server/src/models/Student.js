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
    registeredImage: { type: String, default: null },
    faceEmbedding: { type: [Number], select: false, default: undefined },
    hasFaceEmbedding: { type: Boolean, default: false },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

studentSchema.index({ semester: 1, section: 1, active: 1 });

studentSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.faceEmbedding;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Student', studentSchema);
