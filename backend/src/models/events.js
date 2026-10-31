import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const closureSchema = new Schema({
  start: Date, end: Date, reason: String, disruptionId: String,
}, { _id: false });

const eventSchema = new Schema({
  eventId: { type: String, required: true, unique: true },
  name: String,
  type: { type: String, enum: ['solo', 'team'] },
  rounds: [String],
  durationMinutes: Number,
  venueRequirements: [String],
  equipmentNeeds: [{ item: String, qty: Number, _id: false }],
  volunteersNeeded: Number,
  judgeIds: [String],
});

const venueSchema = new Schema({
  venueId: { type: String, required: true, unique: true },
  name: String,
  capacity: Number,
  indoorOutdoor: String,
  windows: [{ start: Date, end: Date, _id: false }],
  closures: [closureSchema],
});

const registrationSchema = new Schema({
  participantId: { type: String, index: true },
  eventId: { type: String, index: true },
  teamId: { type: String, default: null },
  teamIdIssue: { type: String, default: null },
  active: { type: Boolean, default: true },
});

const judgeSchema = new Schema({
  judgeId: { type: String, required: true, unique: true },
  name: String,
  placeholder: { type: Boolean, default: true },
  eventIds: [String],
});

const slotSchema = new Schema({
  planId: { type: String, index: true },
  slotId: { type: String, index: true },
  eventId: String,
  round: String,
  heat: Number,
  venueId: String,
  start: Date,
  end: Date,
  setupMinutes: Number,
  teardownMinutes: Number,
  expectedSize: Number,
  participantIds: [String],
  teamIds: [String],
  participantsKnown: Boolean,
  judgeIds: [String],
  volunteersNeeded: Number,
  equipment: [{ item: String, qty: Number, _id: false }],
  status: { type: String, enum: ['scheduled', 'unscheduled'], default: 'scheduled' },
  reasonCodes: [String],
});
slotSchema.index({ planId: 1, slotId: 1 }, { unique: true });

export const Event = model('Event', eventSchema);
export const Venue = model('Venue', venueSchema);
export const Registration = model('Registration', registrationSchema);
export const Judge = model('Judge', judgeSchema);
export const Slot = model('Slot', slotSchema);
