import crypto from 'node:crypto';
import { Staff, StaffShift, DutyAssignment, StaffAvailability, StaffAttendance } from '../models/index.js';
import { runCommand } from './command.js';
import { badRequest, conflict, notFound, forbidden } from '../utils/errors.js';
import { can, ROLES } from '../shared/roles.js';
import { parseIST } from '../utils/time.js';

const DEPARTMENTS = ['leadership', 'registration', 'hospitality', 'events', 'logistics', 'merchandise', 'food', 'volunteer'];
const normalizeDate = (value, field) => {
  if (!value) throw badRequest(`${field} is required`);
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? parseIST(value.replace('T', ' '))
    : new Date(value);
  if (!date || Number.isNaN(date.getTime())) throw badRequest(`${field} must be a valid date and time`);
  return date;
};
function rangeFrom(body, current = {}) {
  const startsAt = normalizeDate(body.startsAt ?? current.startsAt, 'startsAt');
  const endsAt = normalizeDate(body.endsAt ?? current.endsAt, 'endsAt');
  if (endsAt <= startsAt) throw badRequest('endsAt must be after startsAt');
  return { startsAt, endsAt };
}
function staffView(staff, role) {
  const value = staff?.toObject ? staff.toObject() : { ...staff };
  if (!can(role, 'staff:write')) delete value.phone;
  return value;
}
function scopedMemberId(user, requestedMemberId) {
  if (user.role === 'volunteer') {
    if (!user.staffMemberId) throw forbidden('This account is not linked to a staff profile. Ask the coordinator to link it.');
    if (requestedMemberId && requestedMemberId !== user.staffMemberId) throw forbidden('Volunteers may only access their own staff record.');
    return user.staffMemberId;
  }
  return requestedMemberId || user.staffMemberId || null;
}
async function activeStaff(memberId) {
  const staff = await Staff.findOne({ memberId, status: 'active' }).lean();
  if (!staff) throw notFound(`No active staff profile for ${memberId}`);
  return staff;
}

export async function listStaff({ user, query = {} }) {
  const memberId = scopedMemberId(user, query.memberId ? String(query.memberId) : null);
  const filter = memberId ? { memberId } : {};
  if (query.department) filter.department = String(query.department);
  if (query.status) filter.status = String(query.status);
  const rows = await Staff.find(filter).select('+phone').sort({ department: 1, name: 1 }).limit(500).lean();
  return { staff: rows.map((row) => staffView(row, user.role)), departments: DEPARTMENTS, roles: Object.entries(ROLES).map(([role, label]) => ({ role, label })) };
}

function cleanProfile(body, current = {}) {
  const memberId = String(body.memberId ?? current.memberId ?? '').trim();
  const name = String(body.name ?? current.name ?? '').trim();
  const role = String(body.role ?? current.role ?? '').trim();
  const department = String(body.department ?? current.department ?? '').trim().toLowerCase();
  if (!memberId || !name || !role || !department) throw badRequest('memberId, name, role and department are required');
  if (!ROLES[role]) throw badRequest('role must be one of the configured staff roles', { roles: Object.keys(ROLES) });
  if (!DEPARTMENTS.includes(department)) throw badRequest(`department must be one of ${DEPARTMENTS.join(', ')}`);
  const email = String(body.email ?? current.email ?? '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('email must be valid');
  const status = body.status ?? current.status ?? 'active';
  if (!['active', 'inactive'].includes(status)) throw badRequest('status must be active or inactive');
  return { memberId, name, role, department, roleLabel: String(body.roleLabel ?? current.roleLabel ?? ROLES[role]).trim(),
    email: email || undefined, phone: String(body.phone ?? current.phone ?? '').trim(), shift: String(body.shift ?? current.shift ?? '').trim(), status };
}

export async function createStaff({ user, body }) {
  const data = cleanProfile(body);
  if (await Staff.exists({ memberId: data.memberId })) throw conflict(`Staff profile ${data.memberId} already exists`);
  return runCommand({ user, action: 'STAFF_CREATED', entity: { type: 'Staff', id: data.memberId }, event: 'staff.created' }, async (session) => {
    const [created] = await Staff.create([data], session ? { session } : {});
    return { summary: { memberId: data.memberId, department: data.department, role: data.role }, result: staffView(created, user.role) };
  });
}

export async function updateStaff({ user, memberId, body }) {
  const current = await Staff.findOne({ memberId }).select('+phone').lean();
  if (!current) throw notFound(`No staff profile ${memberId}`);
  if (body.memberId && body.memberId !== memberId) throw badRequest('memberId cannot be changed');
  const data = cleanProfile({ ...body, memberId }, current);
  return runCommand({ user, action: 'STAFF_UPDATED', entity: { type: 'Staff', id: memberId }, event: 'staff.updated' }, async (session) => {
    const updated = await Staff.findOneAndUpdate({ memberId }, { $set: data }, { new: true, runValidators: true, ...(session ? { session } : {}) });
    return { summary: { memberId, fields: Object.keys(body).filter((field) => field !== 'memberId') }, result: staffView(updated, user.role) };
  });
}

export async function listShifts({ user, query = {} }) {
  const memberId = scopedMemberId(user, query.memberId ? String(query.memberId) : null);
  const filter = memberId ? { memberId } : {};
  if (query.status) filter.status = String(query.status);
  if (query.from || query.to) filter.startsAt = { ...(query.from ? { $gte: normalizeDate(query.from, 'from') } : {}), ...(query.to ? { $lte: normalizeDate(query.to, 'to') } : {}) };
  return { shifts: await StaffShift.find(filter).sort({ startsAt: 1 }).limit(1000).lean() };
}

export async function createShift({ user, body }) {
  const memberId = String(body.memberId || '').trim();
  const staff = await activeStaff(memberId);
  const { startsAt, endsAt } = rangeFrom(body);
  const existing = await StaffShift.findOne({ memberId, status: { $nin: ['cancelled'] }, startsAt: { $lt: endsAt }, endsAt: { $gt: startsAt } }).lean();
  if (existing) throw conflict('This staff member already has an overlapping shift.', { shiftId: existing.shiftId });
  const blocked = await StaffAvailability.findOne({ memberId, status: 'unavailable', startsAt: { $lt: endsAt }, endsAt: { $gt: startsAt } }).lean();
  if (blocked) throw conflict('This shift overlaps a recorded unavailable period.', { availabilityId: String(blocked._id), reason: blocked.reason });
  const availableWindows = await StaffAvailability.find({ memberId, status: 'available' }).lean();
  if (availableWindows.length && !availableWindows.some((window) => window.startsAt <= startsAt && window.endsAt >= endsAt)) {
    throw conflict('This shift is outside the staff member’s recorded availability.');
  }
  const shift = { shiftId: `SHF-${crypto.randomUUID()}`, memberId, department: String(body.department || staff.department), role: String(body.role || staff.role),
    startsAt, endsAt, location: String(body.location || '').trim(), notes: String(body.notes || '').trim(), status: body.status || 'planned', createdBy: user.email };
  if (!['planned', 'confirmed'].includes(shift.status)) throw badRequest('New shifts must be planned or confirmed');
  return runCommand({ user, action: 'STAFF_SHIFT_CREATED', entity: { type: 'StaffShift', id: shift.shiftId }, event: 'staff.shift_created' }, async (session) => {
    const [created] = await StaffShift.create([shift], session ? { session } : {});
    return { summary: { shiftId: shift.shiftId, memberId, startsAt, endsAt }, result: created.toObject() };
  });
}

export async function listAssignments({ user, query = {} }) {
  const memberId = scopedMemberId(user, query.memberId ? String(query.memberId) : null);
  const filter = memberId ? { memberId } : {};
  if (query.status) filter.status = String(query.status);
  const assignments = await DutyAssignment.find(filter).sort({ startsAt: 1 }).limit(1000).lean();
  return { assignments };
}

export async function createAssignment({ user, body }) {
  const shiftId = String(body.shiftId || '').trim();
  const shift = await StaffShift.findOne({ shiftId, status: { $nin: ['cancelled', 'completed'] } }).lean();
  if (!shift) throw notFound(`No open shift ${shiftId}`);
  const memberId = String(body.memberId || shift.memberId).trim();
  if (memberId !== shift.memberId) throw badRequest('Duty assignment must belong to the shift’s staff member');
  const duty = String(body.duty || '').trim();
  if (!duty) throw badRequest('duty is required');
  const startsAt = body.startsAt ? normalizeDate(body.startsAt, 'startsAt') : shift.startsAt;
  const endsAt = body.endsAt ? normalizeDate(body.endsAt, 'endsAt') : shift.endsAt;
  if (startsAt < shift.startsAt || endsAt > shift.endsAt || endsAt <= startsAt) throw badRequest('Duty assignment must fit inside its shift');
  const existing = await DutyAssignment.findOne({ memberId, status: { $nin: ['cancelled'] }, startsAt: { $lt: endsAt }, endsAt: { $gt: startsAt } }).lean();
  if (existing) throw conflict('This staff member already has an overlapping duty assignment.', { assignmentId: existing.assignmentId });
  const assignment = { assignmentId: `DUT-${crypto.randomUUID()}`, shiftId, memberId, department: shift.department, duty,
    location: String(body.location ?? shift.location ?? '').trim(), startsAt, endsAt, notes: String(body.notes || '').trim(), assignedBy: user.email };
  return runCommand({ user, action: 'STAFF_DUTY_ASSIGNED', entity: { type: 'DutyAssignment', id: assignment.assignmentId }, event: 'staff.duty_assigned' }, async (session) => {
    const [created] = await DutyAssignment.create([assignment], session ? { session } : {});
    return { summary: { assignmentId: assignment.assignmentId, memberId, duty }, result: created.toObject() };
  });
}

export async function listAvailability({ user, query = {} }) {
  const memberId = scopedMemberId(user, query.memberId ? String(query.memberId) : null);
  const filter = memberId ? { memberId } : {};
  if (query.status) filter.status = String(query.status);
  return { availability: await StaffAvailability.find(filter).sort({ startsAt: 1 }).limit(1000).lean() };
}

export async function createAvailability({ user, body }) {
  const memberId = String(body.memberId || '').trim();
  await activeStaff(memberId);
  const { startsAt, endsAt } = rangeFrom(body);
  const status = String(body.status || 'available');
  if (!['available', 'unavailable'].includes(status)) throw badRequest('status must be available or unavailable');
  const reason = String(body.reason || '').trim();
  if (status === 'unavailable' && reason.length < 5) throw badRequest('A reason of at least 5 characters is required to mark unavailable');
  const overlap = await StaffAvailability.findOne({ memberId, startsAt: { $lt: endsAt }, endsAt: { $gt: startsAt } }).lean();
  if (overlap) throw conflict('This period overlaps existing availability.', { availabilityId: String(overlap._id), status: overlap.status });
  if (status === 'unavailable') {
    const shift = await StaffShift.findOne({ memberId, status: { $nin: ['cancelled', 'completed'] }, startsAt: { $lt: endsAt }, endsAt: { $gt: startsAt } }).lean();
    if (shift) throw conflict('This period overlaps a scheduled shift. Cancel or reassign the shift first.', { shiftId: shift.shiftId });
  }
  const record = { memberId, startsAt, endsAt, status, reason, recordedBy: user.email };
  return runCommand({ user, action: 'STAFF_AVAILABILITY_RECORDED', entity: { type: 'Staff', id: memberId }, reason, risk: status === 'unavailable' ? 'medium' : 'low', event: 'staff.availability_recorded' }, async (session) => {
    const [created] = await StaffAvailability.create([record], session ? { session } : {});
    return { summary: { memberId, startsAt, endsAt, status }, result: created.toObject() };
  });
}

export async function listAttendance({ user, query = {} }) {
  const memberId = scopedMemberId(user, query.memberId ? String(query.memberId) : null);
  const filter = memberId ? { memberId } : {};
  if (query.shiftId) filter.shiftId = String(query.shiftId);
  const attendance = await StaffAttendance.find(filter).sort({ checkInAt: -1 }).limit(1000).lean();
  return { attendance };
}

export async function recordAttendance({ user, shiftId, action, memberId: requestedMemberId }) {
  const shift = await StaffShift.findOne({ shiftId }).lean();
  if (!shift) throw notFound(`No shift ${shiftId}`);
  const memberId = scopedMemberId(user, requestedMemberId || shift.memberId);
  if (memberId !== shift.memberId) throw badRequest('Attendance member does not match the shift');
  const existing = await StaffAttendance.findOne({ memberId, shiftId }).lean();
  const now = new Date();
  const mutation = action === 'check-in' ? !existing?.checkInAt : Boolean(existing?.checkInAt) && !existing?.checkOutAt;
  if (!mutation) throw conflict(action === 'check-in' ? 'Attendance is already checked in for this shift.' : 'Check in first; this shift is already checked out or has no check-in.');
  if (action === 'check-in' && shift.status === 'cancelled') throw conflict('A cancelled shift cannot be checked in.');
  return runCommand({ user, action: action === 'check-in' ? 'STAFF_CHECKED_IN' : 'STAFF_CHECKED_OUT', entity: { type: 'StaffShift', id: shiftId }, event: `staff.${action.replace('-', '_')}` }, async (session) => {
    const opts = session ? { session } : {};
    const result = action === 'check-in'
      ? await StaffAttendance.findOneAndUpdate({ memberId, shiftId }, { $setOnInsert: { memberId, shiftId }, $set: { checkInAt: now, checkedInBy: user.email, status: now.getTime() > shift.startsAt.getTime() + 15 * 60000 ? 'late' : 'present' } }, { upsert: true, new: true, setDefaultsOnInsert: true, ...opts }).lean()
      : await StaffAttendance.findOneAndUpdate({ memberId, shiftId, checkInAt: { $ne: null }, checkOutAt: null }, { $set: { checkOutAt: now, checkedOutBy: user.email } }, { new: true, ...opts }).lean();
    if (!result) throw conflict('Attendance changed while this action was being recorded. Refresh and try again.');
    await StaffShift.updateOne({ shiftId }, { $set: { status: action === 'check-in' ? 'in_progress' : 'completed' } }, opts);
    return { summary: { memberId, shiftId, action, at: now }, result };
  });
}
