import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const closureSchema = new Schema({
  start: Date, end: Date, reason: String, disruptionId: String,
}, { _id: false });

const eventSchema = new Schema({
  eventId: { type: String, required: true, unique: true },
  code: { type: String, trim: true, uppercase: true },
  name: { type: String, trim: true, index: true },
  description: String,
  category: { type: String, index: true },
  type: { type: String, enum: ['solo', 'team', 'competition', 'performance', 'workshop', 'other'] },
  department: { type: String, index: true },
  coordinatorId: String,
  coordinatorName: String,
  coordinatorContact: String,
  assistantCoordinator: String,
  expectedParticipants: { type: Number, min: 0, default: 0 },
  minimumParticipants: { type: Number, min: 0 },
  maximumCapacity: { type: Number, min: 0 },
  priority: { type: String, enum: ['low', 'normal', 'high', 'critical'], default: 'normal' },
  rounds: [String],
  durationMinutes: { type: Number, min: 1, default: 60 },
  setupMinutes: { type: Number, min: 0, default: 15 },
  teardownMinutes: { type: Number, min: 0, default: 15 },
  eventDate: Date,
  startAt: Date,
  endAt: Date,
  registrationDeadline: Date,
  preparationDeadline: Date,
  requiredVenueType: String,
  venueRequirements: [String],
  equipmentNeeds: [{ item: String, qty: Number, _id: false }],
  staffRequirements: [{ role: String, quantity: Number, _id: false }],
  powerRequirements: String,
  networkingRequirements: String,
  accessibilityRequirements: [String],
  specialRequirements: String,
  budget: { type: Number, min: 0, default: 0 },
  approvedBudget: { type: Number, min: 0 },
  actualCost: { type: Number, min: 0 },
  volunteersNeeded: Number,
  judgeIds: [String],
  status: { type: String, enum: ['draft','submitted','under_review','approved','scheduled','ready','ongoing','completed','cancelled','rejected','archived'], default: 'draft', index: true },
  assignedVenueId: String,
  archivedAt: Date,
  createdBy: String,
  updatedBy: String,
  approvalHistory: [{ action: String, by: String, reason: String, at: { type: Date, default: Date.now }, _id: false }],
  notes: String,
}, { timestamps: true });
eventSchema.index({ code: 1 }, { unique: true, sparse: true });
eventSchema.index({ status: 1, eventDate: 1, category: 1 });

const venueSchema = new Schema({
  venueId: { type: String, required: true, unique: true },
  code: { type: String, trim: true, uppercase: true },
  name: { type: String, trim: true, index: true },
  description: String,
  category: String,
  venueType: String,
  building: String,
  floor: String,
  roomNumber: String,
  campusLocation: String,
  address: String,
  coordinates: { lat: Number, lng: Number },
  mapPosition: { x: { type: Number, min: 0, max: 100 }, y: { type: Number, min: 0, max: 100 } },
  capacity: { type: Number, min: 0, default: 0 },
  seatingCapacity: { type: Number, min: 0 },
  standingCapacity: { type: Number, min: 0 },
  accessibleSeatingCapacity: { type: Number, min: 0 },
  indoorOutdoor: { type: String, enum: ['indoor', 'outdoor', 'mixed'], default: 'indoor' },
  facilities: [String],
  operatingHours: [{ day: String, start: String, end: String, _id: false }],
  availableDays: [String],
  setupMinutes: { type: Number, min: 0, default: 15 },
  teardownMinutes: { type: Number, min: 0, default: 15 },
  managerStaffId: String,
  managerName: String,
  managerContact: String,
  operationalStatus: { type: String, enum: ['available','unavailable','maintenance','closed'], default: 'available', index: true },
  restrictions: [String],
  notes: String,
  windows: [{ start: Date, end: Date, _id: false }],
  closures: [closureSchema],
}, { timestamps: true });
venueSchema.index({ code: 1 }, { unique: true, sparse: true });

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
