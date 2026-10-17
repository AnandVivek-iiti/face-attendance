const mongoose = require("mongoose");
const {
  RECORD_STATUS,
  RECORD_SOURCE,
  AI_DECISION,
} = require("../config/constants");

const evidenceSchema = new mongoose.Schema(
  {
    imageId: { type: mongoose.Schema.Types.ObjectId, required: true },
    faceId: { type: String, required: true },
    bbox: { type: [Number], default: [] },
    similarity: { type: Number, default: null },
    faceQuality: { type: Number, default: null },
    detectionConfidence: { type: Number, default: null },
    decision: { type: String, default: null },
  },
  { _id: false },
);

const recordSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceSession",
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(RECORD_STATUS),
      required: true,
    },
    source: {
      type: String,
      enum: Object.values(RECORD_SOURCE),
      default: RECORD_SOURCE.AI,
    },
    decision: {
      type: String,
      enum: Object.values(AI_DECISION),
      default: AI_DECISION.NOT_DETECTED,
    },
    confidence: { type: Number, default: null },
    faceQuality: { type: Number, default: null },
    aiStudentId: { type: String, default: null },
    evidence: { type: [evidenceSchema], default: [] },
    // Set when a professor deliberately discards a face rather than marking the
    // student absent - keeps an audit trail without changing the status meaning.
    ignored: { type: Boolean, default: false },
    reviewedByProfessor: { type: Boolean, default: false },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

recordSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });
recordSchema.index({ studentId: 1 });

module.exports = mongoose.model("AttendanceRecord", recordSchema);
