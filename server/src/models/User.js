const mongoose = require('mongoose');
const { ROLES } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Every account is keyed on an institutional address.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: Object.values(ROLES), required: true },
    studentId: { type: String, trim: true, default: undefined },
    // Student profile (kept on the account so it survives course changes).
    profile: {
      rollNumber: { type: String, trim: true, default: null },
      year: { type: Number, min: 1, max: 6, default: null },
      semester: { type: Number, min: 1, max: 12, default: null },
      department: { type: String, trim: true, default: null }
    },
    // Which course auto-generated this professor's password. Null means a real
    // password was set by hand, so a later course must not overwrite it.
    passwordSetByCourse: { type: String, default: null }
  },
  { timestamps: true }
);

userSchema.index({ studentId: 1 }, { unique: true, sparse: true });

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
