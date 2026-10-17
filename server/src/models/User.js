const mongoose = require('mongoose');
const { ROLES } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Every account is keyed on an institutional address.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: Object.values(ROLES), required: true },
    department: { type: String, trim: true, default: null },
    studentId: { type: String, trim: true, default: undefined },
    // Student profile (kept on the account so it survives course changes).
    profile: {
      rollNumber: { type: String, trim: true, default: null },
      year: { type: Number, min: 1, max: 6, default: null },
      semester: { type: Number, min: 1, max: 12, default: null },
      department: { type: String, trim: true, default: null }
    },
    // Legacy: older versions derived a professor's password from a course code
    // (guessable). Kept only so scripts/rotate-professor-passwords.js can find
    // and replace those accounts' passwords. New accounts never set it.
    passwordSetByCourse: { type: String, default: null },
    // True while the password is an admin-issued temporary one.
    mustChangePassword: { type: Boolean, default: false },
    // Tokens issued before this moment are rejected (set on password change).
    passwordChangedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

userSchema.index({ studentId: 1 }, { unique: true, sparse: true });

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.passwordChangedAt;
    delete ret.passwordSetByCourse;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
