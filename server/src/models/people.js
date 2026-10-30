import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const participantSchema = new Schema({
  participantId: { type: String, required: true, unique: true },
  name: String,
  contingentId: { type: String, index: true },
  college: String,
  personType: { type: String, enum: ['participant', 'escort', 'leader'], default: 'participant' },
  isLeader: { type: Boolean, default: false },
  raw: { type: Schema.Types.Mixed, select: false },
  genderAsGiven: { type: String, default: null },
  housingCategory: { type: String, enum: ['female', 'male', 'all_gender', 'unconfirmed'] },
  housingConfirmedBy: { type: String, default: null },
  age: Number,
  isMinor: Boolean,
  contact: { type: String, select: false },
  accessibility: { status: { type: String, enum: ['declared', 'declared_none', 'not_declared'] }, needs: [String] },
  dietary: { status: { type: String, enum: ['declared', 'declared_none', 'unknown'] }, needs: [String] },
  arrival: Date,
  departure: Date,
  accommodationRequested: Boolean,
  tshirtSize: String,
  checkInStatus: { type: String, enum: ['expected', 'checked_in', 'delayed', 'absent'], default: 'expected' },
  quarantined: { type: Boolean, default: false },
  mergedInto: { type: String, default: null },
  active: { type: Boolean, default: true },
  attrs: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const contingentSchema = new Schema({
  contingentId: { type: String, required: true, unique: true },
  college: String,
  leaderName: String,
  leaderParticipantId: { type: String, default: null },
  escortName: String,
  escortPersonId: { type: String, default: null },
  strengthDeclared: Number,
  preferencesRaw: String,
  preferences: [String],
}, { timestamps: true });

const staffSchema = new Schema({
  memberId: { type: String, required: true, unique: true },
  name: String,
  role: String,
  roleLabel: String,
  shift: String,
  phone: { type: String, select: false },
});

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
