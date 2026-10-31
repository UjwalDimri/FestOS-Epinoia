import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const pulseReportSchema = new Schema({
  reportId: { type: String, required: true, unique: true },
  venueId: { type: String, required: true, index: true },
  kind: { type: String, enum: ['crowd', 'queue', 'issue'], required: true },
  level: { type: String, enum: ['low', 'moderate', 'busy', 'full'] },
  waitMinutes: { type: Number, min: 0, max: 2400 },
  message: { type: String, trim: true, maxlength: 280, default: '' },
  expiresAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['active', 'resolved'], default: 'active', index: true },
  reporterRole: { type: String, required: true },
}, { timestamps: true });

pulseReportSchema.index({ venueId:  1, kind: 1, createdAt: -1 });

export const PulseReport = model('PulseReport', pulseReportSchema);
