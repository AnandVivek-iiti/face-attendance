const mongoose = require('mongoose');

const upperTrim = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

const courseSchema = new mongoose.Schema(
  {
    courseCode: { type: String, required: true, set: upperTrim },
    courseName: { type: String, required: true, trim: true },
    professorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    semester: { type: Number, required: true, min: 1, max: 12 },
    section: { type: String, required: true, set: upperTrim },
    department: { type: String, trim: true, set: upperTrim, default: null },
    room: { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

courseSchema.index({ courseCode: 1, semester: 1, section: 1 }, { unique: true });

courseSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Course', courseSchema);
