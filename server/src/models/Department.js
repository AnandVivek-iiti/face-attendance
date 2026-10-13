const mongoose = require('mongoose');

const upperTrim = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

const departmentSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, set: upperTrim },
    name: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

departmentSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Department', departmentSchema);
