import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const dataIssueSchema = new Schema({
  code: { type: String, index: true },
  severity: { type: String, enum: ['info', 'low', 'medium', 'high'] },
  entity: { type: { type: String }, id: String },
  message: String,
  details: Schema.Types.Mixed,
  status: { type: String, enum: ['open', 'resolved', 'accepted'], default: 'open' },
  resolution: { by: String, reason: String, at: Date },
}, { timestamps: true });
dataIssueSchema.index({ 'entity.id': 1 });

const duplicateCandidateSchema = new Schema({
  a: String,
  b: String,
  score: Number,
  matched: [String],
  differing: [String],
  status: { type: String, enum: ['open', 'merged', 'dismissed'], default: 'open' },
  resolution: { by: String, reason: String, keepId: String, at: Date },
}, { timestamps: true });

const assumptionSchema = new Schema({
  key: { type: String, unique: true },
  value: Schema.Types.Mixed,
  description: String,
  why: String,
  updatedBy: { type: String, default: 'seed' },
}, { timestamps: true });

const constraintSettingSchema = new Schema({
  constraintId: { type: String, unique: true },
  enabled: Boolean,
  params: Schema.Types.Mixed,
  updatedBy: String,
  reason: String,
}, { timestamps: true });

const counterSchema = new Schema({ _id: String, seq: Number });

const participantImportSchema = new Schema({
  batchId: { type: String, required: true, unique: true },
  status: { type: String, enum: ['previewed', 'confirmed'], default: 'previewed', index: true },
  mapping: Schema.Types.Mixed,
  rows: [Schema.Types.Mixed],
  summary: Schema.Types.Mixed,
  createdBy: String,
  confirmedBy: String,
  confirmedAt: Date,
}, { timestamps: true });

const auditLogSchema = new Schema({
  seq: { type: Number, unique: true },
  at: { type: Date, default: Date.now },
  actor: { userId: String, email: String, role: String },
  action: String,
  entity: { type: { type: String }, id: String },
  reason: String,
  risk: String,
  summary: Schema.Types.Mixed,
  disruptionId: String,
  prevHash: String,
  hash: String,
});

const alertSchema = new Schema({
  key: { type: String, unique: true },
  ruleId: String,
  severity: { type: String, enum: ['info', 'low', 'medium', 'high', 'critical'] },
  ownerRole: String,
  title: String,
  detail: String,
  affectedCount: Number,
  entityRefs: [String],
  suggestedAction: String,
  status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open' },
  escalated: { type: Boolean, default: false },
  firstSeenAt: Date,
  lastSeenAt: Date,
  acknowledgedBy: String,
  acknowledgedAt: Date,
  resolvedAt: Date,
});

const disruptionSchema = new Schema({
  disruptionId: { type: String, unique: true },
  type: String,
  params: Schema.Types.Mixed,
  status: { type: String, enum: ['previewed', 'committed', 'discarded'], default: 'previewed' },
  preview: Schema.Types.Mixed,
  result: Schema.Types.Mixed,
  requiresRisk: String,
  createdBy: { userId: String, role: String },
  committedBy: { userId: String, role: String },
  reason: String,
  committedAt: Date,
}, { timestamps: true });

export const DataIssue = model('DataIssue', dataIssueSchema);
export const DuplicateCandidate = model('DuplicateCandidate', duplicateCandidateSchema);
export const Assumption = model('Assumption', assumptionSchema);
export const ConstraintSetting = model('ConstraintSetting', constraintSettingSchema);
export const Counter = model('Counter', counterSchema);
export const ParticipantImportBatch = model('ParticipantImportBatch', participantImportSchema);
export const AuditLog = model('AuditLog', auditLogSchema);
export const Alert = model('Alert', alertSchema);
export const Disruption = model('Disruption', disruptionSchema);
