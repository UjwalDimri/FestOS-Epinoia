import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const closureSchema = new Schema({ start: Date, end: Date, reason: String, disruptionId: String }, { _id: false });

const roomSchema = new Schema({
  roomId: { type: String, required: true, unique: true },
  block: String,
  floor: Number,
  pool: { type: String, enum: ['boys', 'girls', 'all_gender'] },
  capacity: Number,
  accessible: { type: String, enum: ['yes', 'no', 'unknown'] },
  status: { type: String, enum: ['available', 'closed', 'cleaning'], default: 'available' },
  closures: [closureSchema],
});

const propertySchema = new Schema({
  propertyId: { type: String, required: true, unique: true },
  name: String,
  beds: Number,
  costPerBedPerNight: Number,
  distanceKm: Number,
  transport: String,
  accessible: { type: String, enum: ['yes', 'no', 'unknown'], default: 'unknown' },
  status: { type: String, enum: ['available', 'closed'], default: 'available' },
  closures: [closureSchema],
});

const planSchema = new Schema({
  planId: { type: String, required: true, unique: true },
  type: { type: String, enum: ['accommodation', 'schedule'], required: true },
  strategy: String,
  status: { type: String, enum: ['draft', 'active', 'superseded'], default: 'draft' },
  version: { type: Number, default: 1 },
  metrics: Schema.Types.Mixed,
  params: Schema.Types.Mixed,
  createdBy: String,
  activatedBy: String,
  activatedAt: Date,
  reason: String,
}, { timestamps: true });

const allocationSchema = new Schema({
  planId: { type: String, index: true },
  participantId: { type: String, index: true },
  contingentId: String,
  personType: String,
  bed: {
    kind: { type: String, enum: ['hostel', 'external', null] },
    roomId: String,
    propertyId: String,
    bedNo: Number,
    site: String,
    group: String,
  },
  checkIn: Date,
  checkOut: Date,
  nights: Number,
  costPerNight: Number,
  cost: Number,
  status: { type: String, enum: ['proposed', 'confirmed', 'checked_in', 'released', 'unplaced'] },
  reasonCodes: [String],
  relaxed: [String],
  overrideReason: String,
}, { timestamps: true });
allocationSchema.index({ planId: 1, participantId: 1, status: 1 });

export const Room = model('Room', roomSchema);
export const ExternalProperty = model('ExternalProperty', propertySchema);
export const Plan = model('Plan', planSchema);
export const Allocation = model('Allocation', allocationSchema);
