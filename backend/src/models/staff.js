import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const staffShiftSchema = new Schema({
  shiftId: { type: String, required: true, unique: true },
  memberId: { type: String, required: true, index: true },
  department: { type: String, required: true },
  role: { type: String, required: true },
  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date, required: true },
  location: { type: String, default: '' },
  status: { type: String, enum: ['planned', 'confirmed', 'in_progress', 'completed', 'cancelled'], default: 'planned', index: true },
  notes: { type: String, default: '' },
  createdBy: String,
}, { timestamps: true });
staffShiftSchema.index({ memberId: 1, startsAt: 1, endsAt: 1 });

const dutyAssignmentSchema = new Schema({
  assignmentId: { type: String, required: true, unique: true },
  shiftId: { type: String, required: true, index: true },
  memberId: { type: String, required: true, index: true },
  department: { type: String, required: true },
  duty: { type: String, required: true },
  location: { type: String, default: '' },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  status: { type: String, enum: ['assigned', 'in_progress', 'completed', 'cancelled'], default: 'assigned', index: true },
  notes: { type: String, default: '' },
  assignedBy: String,
}, { timestamps: true });
dutyAssignmentSchema.index({ memberId: 1, startsAt: 1, endsAt: 1 });

const staffAvailabilitySchema = new Schema({
  memberId: { type: String, required: true, index: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  status: { type: String, enum: ['available', 'unavailable'], required: true },
  reason: { type: String, default: '' },
  recordedBy: String,
}, { timestamps: true });
staffAvailabilitySchema.index({ memberId: 1, startsAt: 1, endsAt: 1 });

const staffAttendanceSchema = new Schema({
  memberId: { type: String, required: true, index: true },
  shiftId: { type: String, required: true },
  status: { type: String, enum: ['present', 'late', 'absent'], default: 'present' },
  checkInAt: Date,
  checkedInBy: String,
  checkOutAt: Date,
  checkedOutBy: String,
  notes: { type: String, default: '' },
}, { timestamps: true });
staffAttendanceSchema.index({ memberId: 1, shiftId: 1 }, { unique: true });

export const StaffShift = model('StaffShift', staffShiftSchema);
export const DutyAssignment = model('DutyAssignment', dutyAssignmentSchema);
export const StaffAvailability = model('StaffAvailability', staffAvailabilitySchema);
export const StaffAttendance = model('StaffAttendance', staffAttendanceSchema);
