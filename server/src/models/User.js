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
    // True while the password is an admin-issued temporary one.
    mustChangePassword: { type: Boolean, default: false },
    // Professors prove ownership of their address by opening a one-time link emailed to them.
    emailVerified: { type: Boolean, default: false },
    // Only the hash of the current one-time link token is stored, never the raw value that goes in the email.
    emailVerificationTokenHash: { type: String, select: false, default: null },
    emailVerificationExpiresAt: { type: Date, select: false, default: null },
    // Tokens issued before this moment are rejected (set on password change).
    passwordChangedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

userSchema.index({ studentId: 1 }, { unique: true, sparse: true });
// One-time sign-in links are looked up by token hash.
userSchema.index({ emailVerificationTokenHash: 1 }, { sparse: true });

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.passwordChangedAt;
    delete ret.emailVerificationTokenHash;
    delete ret.emailVerificationExpiresAt;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
