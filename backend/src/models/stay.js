import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const closureSchema = new Schema({ start: Date, end: Date, reason: String, disruptionId: String }, { _id: false });
const reservationSchema = new Schema({
  allocationId: { type: Schema.Types.ObjectId, ref: 'Allocation' }, bedNo: Number, participantId: String,
  start: Date, end: Date, status: { type: String, enum: ['reserved', 'confirmed', 'checked_in'], default: 'reserved' },
}, { _id: false });
const bedSlotSchema = new Schema({
  bedId: { type: String, required: true }, label: String,
  status: { type: String, enum: ['available', 'blocked', 'maintenance'], default: 'available' },
}, { _id: false });

const roomSchema = new Schema({
  roomId: { type: String, required: true, unique: true },
  propertyId: { type: String, index: true },
  roomNumber: String,
  block: String,
  floor: Number,
  roomType: { type: String, enum: ['single', 'double', 'triple', 'dormitory', 'other'] },
  gender: { type: String, enum: ['boys', 'girls', 'all_gender'] },
  capacity: Number,
  accessibility: { type: String, enum: ['yes', 'no', 'unknown'] },
  status: { type: String, enum: ['available', 'closed', 'cleaning', 'occupied', 'partially_occupied', 'cleaning_required', 'cleaning_in_progress', 'maintenance', 'blocked', 'unavailable', 'dirty', 'cleaned', 'inspection_pending', 'ready'], default: 'available' },
  facilities: [String], housekeepingNotes: String, lastCleanedAt: Date, lastInspectedAt: Date,
  beds: [bedSlotSchema], reservations: [reservationSchema], reservationVersion: { type: Number, default: 0 },
  closures: [closureSchema],
});

const propertySchema = new Schema({
  propertyId: { type: String, required: true, unique: true },
  propertyName: String,
  propertyType: { type: String, enum: ['college_hostel', 'hotel', 'guest_house', 'private_hostel', 'other'], default: 'hotel' },
  ownership: { type: String, enum: ['internal', 'external'], default: 'external' },
  address: String, city: String, contactPerson: String, contactNumber: String, email: String,
  totalRoomCount: Number, facilities: [String], accessibilityFacilities: [String], genderPolicy: { type: String, enum: ['boys', 'girls', 'all_gender', 'any', 'unknown'], default: 'unknown' }, notes: String,
  vendorReference: String,
  costModel: { type: String, enum: ['per_bed_per_night', 'per_room_per_night', 'fixed_contract', 'custom'], default: 'per_bed_per_night' },
  basePrice: Number, taxPercent: Number, additionalCharges: [{ label: String, amount: Number, _id: false }],
  contractedBedCapacity: Number, contractStart: Date, contractEnd: Date,
  paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid', 'unknown'], default: 'unknown' },
  advancePayment: Number, totalContractAmount: Number, actualExpenditure: Number,
  beds: Number,
  costPerBedPerNight: Number,
  distanceKm: Number,
  transportAvailability: String,
  accessibility: { type: String, enum: ['yes', 'no', 'unknown'], default: 'unknown' },
  status: { type: String, enum: ['available', 'active', 'inactive', 'temporarily_closed', 'maintenance', 'closed'], default: 'available' },
  reservations: [reservationSchema], reservationVersion: { type: Number, default: 0 },
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
  allocationId: { type: String, unique: true, sparse: true },
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
  status: { type: String, enum: ['proposed', 'reserved', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'moved', 'no_show', 'released', 'unplaced'] },
  allocationMethod: { type: String, enum: ['automatic', 'manual', 'emergency', 'reallocation'] },
  allocationBatchId: String, allocatedBy: String, confirmedBy: String, manualOverrideReason: String,
  previousAllocationId: { type: Schema.Types.ObjectId, ref: 'Allocation' }, checkInAt: Date, checkOutAt: Date,
  reasonCodes: [String],
  relaxed: [String],
  overrideReason: String,
}, { timestamps: true });
allocationSchema.index({ planId: 1, participantId: 1, status: 1 });
allocationSchema.index({ participantId: 1, checkIn: 1, checkOut: 1, status: 1 });
allocationSchema.index({ 'bed.roomId': 1, 'bed.bedNo': 1, checkIn: 1, checkOut: 1, status: 1 });
allocationSchema.index({ 'bed.propertyId': 1, 'bed.bedNo': 1, checkIn: 1, checkOut: 1, status: 1 });

const housekeepingTaskSchema = new Schema({
  taskId: { type: String, required: true, unique: true }, propertyId: String, roomId: { type: String, index: true },
  taskType: { type: String, enum: ['cleaning', 'inspection', 'maintenance', 'linen_change', 'other'], default: 'cleaning' },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  status: { type: String, enum: ['pending', 'assigned', 'in_progress', 'completed', 'verified', 'cancelled'], default: 'pending' },
  assignedStaffId: String, createdBy: String, startedAt: Date, completedAt: Date, verifiedBy: String,
  cleaningNotes: String, maintenanceNotes: String, beforeCondition: String, afterCondition: String,
}, { timestamps: true });
housekeepingTaskSchema.index({ propertyId: 1, status: 1, priority: 1 });

const accommodationPolicySchema = new Schema({
  key: { type: String, unique: true }, value: Schema.Types.Mixed, updatedBy: String, reason: String,
}, { timestamps: true });

export const Room = model('Room', roomSchema);
export const ExternalProperty = model('ExternalProperty', propertySchema);
export const Plan = model('Plan', planSchema);
export const Allocation = model('Allocation', allocationSchema);
export const HousekeepingTask = model('HousekeepingTask', housekeepingTaskSchema);
export const AccommodationPolicy = model('AccommodationPolicy', accommodationPolicySchema);
