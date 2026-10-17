const mongoose = require('mongoose');
const { AUDIT_ACTIONS } = require('../config/constants');

const auditLogSchema = new mongoose.Schema(
  {
    // Only session-scoped events (analysis, record changes, finalize) carry a
    // session; account/roster events (courses, departments, professors,
    // enrollment) are not tied to one, so this is optional.
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession', default: null },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    actorType: { type: String, enum: ['user', 'ai', 'system'], required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, enum: Object.values(AUDIT_ACTIONS), required: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    note: { type: String, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ sessionId: 1, createdAt: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
