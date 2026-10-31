import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const participantSchema = new Schema({
  participantId: { type: String, required: true, unique: true },
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  name: String,
  email: { type: String, trim: true, lowercase: true, index: true },
  contingentId: { type: String, index: true },
  college: String,
  personType: { type: String, enum: ['participant', 'escort', 'leader'], default: 'participant' },
  isLeader: { type: Boolean, default: false },
  raw: { type: Schema.Types.Mixed, select: false },
  gender: { type: String, default: null },
  housingCategory: { type: String, enum: ['female', 'male', 'all_gender', 'unconfirmed'] },
  housingConfirmedBy: { type: String, default: null },
  age: Number,
  isMinor: Boolean,
  contact: { type: String, select: false },
  recordStatus: { type: String, enum: ['unverified', 'verified', 'needs_review', 'conflicting'], default: 'unverified', index: true },
  source: { type: String, enum: ['manual', 'csv_import', 'external'], default: 'manual' },
  sourceRowId: String,
  internalNotes: { type: String, select: false },
  arrivalMode: { type: String, enum: ['train', 'bus', 'flight', 'private_vehicle', 'other', 'unknown'], default: 'unknown' },
  arrivalLocation: String,
  departureLocation: String,
  accessibilityNeeds: { status: { type: String, enum: ['declared', 'declared_none', 'not_declared'] }, needs: [String] },
  dietaryNeeds: { status: { type: String, enum: ['declared', 'declared_none', 'unknown'] }, needs: [String] },
  arrivalDateTime: Date,
  departureDateTime: Date,
  accommodationRequested: Boolean,
  tshirtSize: String,
  checkInStatus: { type: String, enum: ['expected', 'checked_in', 'delayed', 'absent'], default: 'expected' },
  quarantined: { type: Boolean, default: false },
  mergedInto: { type: String, default: null },
  active: { type: Boolean, default: true },
  attrs: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });
participantSchema.index({ contingentId: 1, active: 1, participantId: 1 });
participantSchema.index({ name: 1, college: 1 });
participantSchema.index({ arrivalDateTime: 1, departureDateTime: 1 });

const contingentSchema = new Schema({
  contingentId: { type: String, required: true, unique: true },
  college: String,
  collegeCode: { type: String, trim: true, uppercase: true },
  collegeCity: String,
  collegeState: String,
  collegeContactPerson: String,
  contactEmail: { type: String, trim: true, lowercase: true },
  contactPhone: String,
  status: { type: String, enum: ['expected', 'confirmed', 'arrived', 'partially_arrived', 'departed', 'cancelled'], default: 'expected', index: true },
  arrivalDateTime: Date,
  departureDateTime: Date,
  internalNotes: { type: String, select: false },
  leader: String,
  leaderParticipantId: { type: String, default: null },
  escort: String,
  escortPersonId: { type: String, default: null },
  strengthDeclared: Number,
  preferencesRaw: String,
  preferences: [String],
}, { timestamps: true });
contingentSchema.index({ collegeCode: 1 }, { unique: true, partialFilterExpression: { collegeCode: { $type: 'string' } } });

const staffSchema = new Schema({
  memberId: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  department: { type: String, trim: true, index: true },
  role: { type: String, required: true, index: true },
  roleLabel: String,
  shift: String,
  phone: { type: String, select: false },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
}, { timestamps: true });

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  name: String,
  role: { type: String, required: true },
  passwordHash: { type: String, select: false },
  staffMemberId: { type: String, default: null },
  clerkUserId: { type: String, default: null },
}, { timestamps: true });

export const Participant = model('Participant', participantSchema);
export const Contingent = model('Contingent', contingentSchema);
export const Staff = model('Staff', staffSchema);
export const User = model('User', userSchema);
