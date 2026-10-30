import express from 'express';
import crypto from 'node:crypto';
import * as M from '../../models/index.js';
import { requirePerm } from '../../middleware/auth.js';
import { ah, badRequest, conflict, notFound } from '../../utils/errors.js';
import { loadState, accommodationRun, activePlan } from '../../services/state.js';
import { appendAudit, runCommand } from '../../services/command.js';
import { nightKeys } from '../../engines/allocation.js';
import { emit } from '../../services/eventBus.js';

export const accommodationApi = express.Router();
const id = () => crypto.randomUUID();
const PAGE_MAX = 200;
const parsePage = (q) => ({ page: Math.max(1, Number(q.page) || 1), limit: Math.max(1, Math.min(PAGE_MAX, Number(q.limit) || 50)) });
const pageMeta = (total, page, limit) => ({ total, page, pageSize: limit, totalPages: Math.ceil(total / limit), hasNextPage: page < Math.ceil(total / limit), hasPreviousPage: page > 1 });
const clean = (x) => typeof x === 'string' ? x.trim() : x;
const escapeRx = (x) => new RegExp(String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const ACTIVE = ['proposed', 'reserved', 'confirmed', 'checked_in'];
const validDate = (v, field) => { const d = new Date(v); if (!v || Number.isNaN(d.getTime())) throw badRequest(`${field} must be a valid date`); return d; };
const rangesOverlap = (a0, a1, b0, b1) => new Date(a0) < new Date(b1) && new Date(b0) < new Date(a1);
const audit = (req, action, type, entityId, summary, reason) => appendAudit({ actor: { userId: req.user.userId, email: req.user.email, role: req.user.role }, action, entity: { type, id: String(entityId) }, summary, reason, risk: 'low' });

function bedSlots(roomId, capacity) { return Array.from({ length: capacity }, (_, i) => ({ bedId: `${roomId}-B${i + 1}`, label: String(i + 1), status: 'available' })); }
function apiResult(total, rows, page, limit) { return { ...pageMeta(total, page, limit), rows }; }
function participantProjection(p) {
  return { participantId: p.participantId, name: p.name, contingentId: p.contingentId, college: p.college, arrivalDateTime: p.arrivalDateTime, departureDateTime: p.departureDateTime, gender: p.gender, housingCategory: p.housingCategory, accessibilityNeeds: p.accessibilityNeeds, accommodationRequested: p.accommodationRequested };
}
function conditionForAllocation(a) {
  return a.bed?.kind === 'hostel' ? { roomId: a.bed.roomId } : { propertyId: a.bed?.propertyId };
}
function estimateCost(a, prop) {
  const nights = nightKeys(a.checkIn, a.checkOut).length;
  const amount = Number(prop?.basePrice ?? prop?.costPerBedPerNight ?? a.costPerNight ?? 0);
  let base = prop?.costModel === 'fixed_contract' ? Number(prop.totalContractAmount ?? amount) : prop?.costModel === 'custom' ? amount : amount * nights;
  const charges = (prop?.additionalCharges || []).reduce((s, c) => s + Number(c.amount || 0), 0);
  const tax = (base + charges) * Number(prop?.taxPercent || 0) / 100;
  return { nights, base, charges, tax, total: base + charges + tax };
}
function propertyCostSummary(property, allocations) {
  const rate = Number(property.basePrice ?? property.costPerBedPerNight ?? 0);
  const charges = (property.additionalCharges || []).reduce((s, c) => s + Number(c.amount || 0), 0);
  let base = 0;
  if (property.costModel === 'fixed_contract') base = Number(property.totalContractAmount ?? rate);
  else if (property.costModel === 'custom') base = rate * allocations.length;
  else if (property.costModel === 'per_room_per_night') {
    const roomNights = new Set();
    for (const a of allocations) for (const day of nightKeys(a.checkIn, a.checkOut)) roomNights.add(`${a.bed?.roomId || property.propertyId}:${day}`);
    base = roomNights.size * rate;
  } else base = allocations.reduce((s, a) => s + rate * nightKeys(a.checkIn, a.checkOut).length, 0);
  const tax = (base + charges) * Number(property.taxPercent || 0) / 100;
  return { base, charges, tax, total: base + charges + tax };
}
async function validateManualBed(person, bed, checkIn, checkOut) {
  if (!Number.isInteger(Number(bed?.bedNo)) || Number(bed.bedNo) < 1) throw badRequest('bedNo must be a positive integer');
  if (bed.kind === 'hostel') {
    const room = await M.Room.findOne({ roomId: bed.roomId }).lean(); if (!room) throw notFound('Destination room does not exist');
    if (room.propertyId && await M.ExternalProperty.exists({ propertyId: room.propertyId, propertyType: { $ne: 'college_hostel' } })) throw badRequest('External property beds are reserved via the property bed inventory; choose propertyId instead of roomId');
    if (!['ready','available'].includes(room.status)) throw conflict(`Room ${room.roomId} is not ready`);
    if (Number(bed.bedNo) > room.capacity) throw badRequest('bedNo is outside room capacity');
    const slot = room.beds?.find((x) => x.bedId === `${room.roomId}-B${bed.bedNo}`); if (slot && slot.status !== 'available') throw conflict('Requested bed is blocked or under maintenance');
    if (person.housingCategory === 'female' && !['girls','all_gender'].includes(room.gender) || person.housingCategory === 'male' && !['boys','all_gender'].includes(room.gender)) throw conflict('Room gender policy is incompatible');
    if (person.accessibilityNeeds?.status === 'declared' && room.accessibility !== 'yes') throw conflict('Room accessibility is not confirmed suitable');
    return { ...bed, bedNo: Number(bed.bedNo), site: 'campus', group: room.block };
  }
  if (bed.kind === 'external') {
    const prop = await M.ExternalProperty.findOne({ propertyId: bed.propertyId }).lean(); if (!prop) throw notFound('Destination property does not exist');
    if (!['available','active'].includes(prop.status) || Number(bed.bedNo) > Number(prop.contractedBedCapacity ?? prop.beds)) throw conflict('External bed is unavailable or outside contracted capacity');
    if (prop.contractStart && new Date(checkIn) < new Date(prop.contractStart) || prop.contractEnd && new Date(checkOut) > new Date(prop.contractEnd)) throw conflict('Stay falls outside property contract dates');
    if (person.accessibilityNeeds?.status === 'declared' && prop.accessibility !== 'yes') throw conflict('Property accessibility is not confirmed suitable');
    if (prop.genderPolicy === 'girls' && person.housingCategory !== 'female' || prop.genderPolicy === 'boys' && person.housingCategory !== 'male') throw conflict('Property gender policy is incompatible');
    return { ...bed, bedNo: Number(bed.bedNo), site: prop.propertyId, group: prop.propertyId };
  }
  throw badRequest('bed.kind must be hostel or external');
}

// ---------------- properties (ExternalProperty remains the compatible property source)
accommodationApi.get('/accommodation/properties', requirePerm('accommodation:read'), ah(async (req, res) => {
  const q = {};
  for (const key of ['propertyType', 'ownership', 'status', 'city']) if (req.query[key]) q[key] = key === 'city' ? escapeRx(req.query.city) : req.query[key];
  if (req.query.q) q.$or = [{ propertyId: escapeRx(req.query.q) }, { propertyName: escapeRx(req.query.q) }, { city: escapeRx(req.query.q) }];
  const { page, limit } = parsePage(req.query);
  const [rows, total] = await Promise.all([M.ExternalProperty.find(q).sort({ propertyId: 1 }).skip((page - 1) * limit).limit(limit).lean(), M.ExternalProperty.countDocuments(q)]);
  res.json(apiResult(total, rows, page, limit));
}));
accommodationApi.post('/accommodation/properties', requirePerm('accommodation:write'), ah(async (req, res) => {
  const b = req.body || {};
  if (!b.propertyId || !b.propertyName) throw badRequest('propertyId and propertyName are required');
  const allowed = ['propertyId','propertyName','propertyType','ownership','address','city','contactPerson','contactNumber','email','totalRoomCount','beds','distanceKm','costPerBedPerNight','transportAvailability','accessibility','accessibilityFacilities','genderPolicy','notes','vendorReference','costModel','basePrice','taxPercent','additionalCharges','contractedBedCapacity','contractStart','contractEnd','paymentStatus','advancePayment','totalContractAmount','actualExpenditure','status','facilities'];
  const data = Object.fromEntries(Object.entries(b).filter(([k]) => allowed.includes(k)).map(([k,v]) => [k,clean(v)]));
  for (const k of ['beds','totalRoomCount','contractedBedCapacity','basePrice','taxPercent','costPerBedPerNight','distanceKm','advancePayment','totalContractAmount','actualExpenditure']) if (data[k] != null && (!Number.isFinite(Number(data[k])) || Number(data[k]) < 0)) throw badRequest(`${k} must be a non-negative number`);
  const out = await runCommand({ user: req.user, action: 'ACCOMMODATION_PROPERTY_CREATED', entity: { type: 'ExternalProperty', id: data.propertyId }, event: 'accommodation.property.created' }, async (session) => {
    const [property] = await M.ExternalProperty.create([data], session ? { session } : {});
    return { summary: { propertyId: property.propertyId }, result: { property } };
  }); res.status(201).json(out);
}));
accommodationApi.get('/accommodation/properties/:id', requirePerm('accommodation:read'), ah(async (req, res) => {
  const property = await M.ExternalProperty.findOne({ propertyId: req.params.id }).lean(); if (!property) throw notFound('No such property');
  res.json({ property });
}));
accommodationApi.put('/accommodation/properties/:id', requirePerm('accommodation:write'), ah(async (req, res) => {
  const allowed = ['propertyName','propertyType','ownership','address','city','contactPerson','contactNumber','email','totalRoomCount','beds','distanceKm','costPerBedPerNight','transportAvailability','accessibility','accessibilityFacilities','genderPolicy','notes','vendorReference','costModel','basePrice','taxPercent','additionalCharges','contractedBedCapacity','contractStart','contractEnd','paymentStatus','advancePayment','totalContractAmount','actualExpenditure','facilities'];
  const data = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)).map(([k,v]) => [k,clean(v)]));
  const property = await M.ExternalProperty.findOneAndUpdate({ propertyId: req.params.id }, { $set: data }, { new: true, runValidators: true }); if (!property) throw notFound('No such property');
  await audit(req,'ACCOMMODATION_PROPERTY_UPDATED','ExternalProperty',req.params.id,{fields:Object.keys(data)});
  res.json({ property });
}));
accommodationApi.patch('/accommodation/properties/:id/status', requirePerm('accommodation:write'), ah(async (req, res) => {
  if (!['available','active','inactive','temporarily_closed','maintenance','closed'].includes(req.body?.status)) throw badRequest('Unsupported property status');
  const previous = await M.ExternalProperty.findOneAndUpdate({ propertyId: req.params.id }, { status: req.body.status }, { new: true, runValidators: true }); if (!previous) throw notFound('No such property'); const property=previous;
  await audit(req,'ACCOMMODATION_PROPERTY_STATUS','ExternalProperty',property.propertyId,{status:property.status});
  emit('accommodation.property.status', { entity: { type: 'ExternalProperty', id: property.propertyId }, status: property.status, at: new Date() }); res.json({ property });
}));
accommodationApi.get('/accommodation/properties/:id/rooms', requirePerm('accommodation:read'), ah(async (req, res) => {
  const rows = await M.Room.find({ propertyId: req.params.id }).sort({ roomId: 1 }).lean(); res.json({ rooms: rows });
}));
accommodationApi.get('/accommodation/properties/:id/occupancy', requirePerm('accommodation:read'), ah(async (req, res) => {
  const rooms = await M.Room.find({ propertyId: req.params.id }).lean();
  const property = await M.ExternalProperty.findOne({ propertyId: req.params.id }).lean();
  const at = req.query.date ? validDate(req.query.date,'date') : new Date();
  const allocated = await M.Allocation.find({ 'bed.propertyId': req.params.id, status: { $in: ACTIVE }, checkIn: { $lte: at }, checkOut: { $gt: at } }).lean();
  const activeBeds = new Set(allocated.map((a) => a.bed?.bedNo));
  const capacity = property && property.propertyType !== 'college_hostel' ? Number(property.contractedBedCapacity ?? property.beds ?? 0) : rooms.reduce((s, r) => s + Number(r.capacity || 0), 0);
  res.json({ propertyId: req.params.id, physicalBeds: capacity, allocatedBeds: activeBeds.size || allocated.length, availableBeds: Math.max(0, capacity - (activeBeds.size || allocated.length)), rooms: rooms.length });
}));
accommodationApi.get('/accommodation/properties/:id/cost-summary', requirePerm('accommodation:read'), ah(async (req, res) => {
  const property = await M.ExternalProperty.findOne({ propertyId: req.params.id }).lean(); if (!property) throw notFound('No such property');
  const allocs = await M.Allocation.find({ 'bed.propertyId': property.propertyId, status: { $in: ACTIVE } }).lean();
  const estimated = propertyCostSummary(property, allocs).total;
  res.json({ propertyId: property.propertyId, currency: 'INR', estimated, actual: Number(property.actualExpenditure || 0), paid: Number(property.advancePayment || 0), outstanding: Math.max(0, estimated - Number(property.advancePayment || 0)), allocationCount: allocs.length });
}));

// ---------------- rooms and bed slots
accommodationApi.get('/accommodation/rooms', requirePerm('accommodation:read'), ah(async (req, res) => {
  const q = {};
  if (req.query.propertyId) q.propertyId = req.query.propertyId; if (req.query.floor != null) q.floor = Number(req.query.floor);
  if (req.query.roomType) q.roomType = req.query.roomType; if (req.query.status) q.status = req.query.status;
  if (req.query.minCapacity) q.capacity = { $gte: Number(req.query.minCapacity) };
  const { page, limit } = parsePage(req.query); const [rows,total] = await Promise.all([M.Room.find(q).sort({ roomId:1 }).skip((page-1)*limit).limit(limit).lean(), M.Room.countDocuments(q)]);
  const now = new Date();
  const counts = await M.Allocation.aggregate([{ $match: { status: { $in: ACTIVE }, checkIn: { $lte: now }, checkOut: { $gt: now }, 'bed.roomId': { $in: rows.map((r) => r.roomId) } } }, { $group: { _id: '$bed.roomId', n: { $sum: 1 } } }]); const by = new Map(counts.map((x) => [x._id,x.n]));
  res.json(apiResult(total, rows.map((r) => { const occupiedBeds=by.get(r.roomId)||0;const operationalStatus=['blocked','maintenance','cleaning_required','cleaning_in_progress','inspection_pending','closed','unavailable'].includes(r.status)?r.status:occupiedBeds>=r.capacity?'occupied':occupiedBeds?'partially_occupied':r.status;return {...r,occupiedBeds,availableBeds:Math.max(0,r.capacity-occupiedBeds),operationalStatus}; }), page, limit));
}));
accommodationApi.post('/accommodation/rooms', requirePerm('accommodation:write'), ah(async (req, res) => {
  const b = req.body || {}; const capacity = Number(b.capacity);
  if (!b.roomId || !Number.isInteger(capacity) || capacity < 1 || capacity > 100) throw badRequest('roomId and capacity (1-100) are required');
  if (b.propertyId && !await M.ExternalProperty.exists({ propertyId: b.propertyId })) throw badRequest('propertyId does not exist');
  const room = await M.Room.create({ roomId: clean(b.roomId), propertyId: b.propertyId, roomNumber: b.roomNumber, block: b.block, floor: b.floor == null ? undefined : Number(b.floor), roomType: b.roomType, gender: b.gender, capacity, accessibility: b.accessibility || 'unknown', status: b.status || 'ready', facilities: b.facilities || [], beds: bedSlots(clean(b.roomId), capacity) });
  await audit(req,'ACCOMMODATION_ROOM_CREATED','Room',room.roomId,{propertyId:room.propertyId,capacity:room.capacity});
  res.status(201).json({ room });
}));
accommodationApi.get('/accommodation/rooms/:id', requirePerm('accommodation:read'), ah(async (req, res) => { const room = await M.Room.findOne({ roomId: req.params.id }).lean(); if (!room) throw notFound('No such room'); res.json({ room }); }));
accommodationApi.put('/accommodation/rooms/:id', requirePerm('accommodation:write'), ah(async (req, res) => {
  const data = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => ['roomNumber','block','floor','roomType','gender','accessibility','facilities','housekeepingNotes'].includes(k)));
  if (req.body.capacity != null) { const capacity = Number(req.body.capacity); if (!Number.isInteger(capacity) || capacity < 1) throw badRequest('capacity must be positive'); const current = await M.Room.findOne({ roomId: req.params.id }).lean(); if (!current) throw notFound('No such room'); if (capacity < (current.reservations || []).filter((r) => ACTIVE.includes(r.status)).length) throw conflict('Capacity cannot be reduced below active reservations'); data.capacity = capacity; data.beds = [...(current.beds || []), ...bedSlots(req.params.id, capacity).slice((current.beds || []).length)].slice(0, capacity); }
  const room = await M.Room.findOneAndUpdate({ roomId: req.params.id }, { $set: data }, { new: true, runValidators: true }); if (!room) throw notFound('No such room'); await audit(req,'ACCOMMODATION_ROOM_UPDATED','Room',room.roomId,{fields:Object.keys(data)}); res.json({ room });
}));
accommodationApi.patch('/accommodation/rooms/:id/status', requirePerm('accommodation:write'), ah(async (req, res) => {
  const allowed = ['ready','available','cleaning_required','cleaning_in_progress','cleaning','cleaned','inspection_pending','maintenance','blocked','closed','unavailable']; if (!allowed.includes(req.body?.status)) throw badRequest('Unsupported room status');
  const existing = await M.Room.findOne({ roomId: req.params.id }).lean(); if (!existing) throw notFound('No such room');
  if (req.body.status === 'ready' && existing.status !== 'ready' && existing.status !== 'available' && !await M.HousekeepingTask.exists({ roomId: existing.roomId, status: 'verified' })) throw conflict('A room becomes ready only after housekeeping verification');
  const room = await M.Room.findOneAndUpdate({ roomId: req.params.id }, { status: req.body.status }, { new: true, runValidators: true }); if (!room) throw notFound('No such room');
  await audit(req,'ACCOMMODATION_ROOM_STATUS','Room',room.roomId,{status:room.status});
  emit('accommodation.room.status', { entity: { type: 'Room', id: room.roomId }, status: room.status, at: new Date() }); res.json({ room });
}));
accommodationApi.get('/accommodation/rooms/:id/occupants', requirePerm('accommodation:read'), ah(async (req, res) => {
  const q = { 'bed.roomId': req.params.id, status: { $in: ACTIVE } }; const allocs = await M.Allocation.find(q).sort({ checkIn: 1 }).lean();
  const people = await M.Participant.find({ participantId: { $in: allocs.map((a) => a.participantId) } }).lean(); const by = new Map(people.map((p) => [p.participantId,participantProjection(p)]));
  res.json({ roomId: req.params.id, occupants: allocs.map((a) => ({ allocation: a, participant: by.get(a.participantId) })) });
}));
accommodationApi.get('/accommodation/rooms/:id/availability', requirePerm('accommodation:read'), ah(async (req, res) => {
  const from = validDate(req.query.from, 'from'), to = validDate(req.query.to, 'to'); if (to <= from) throw badRequest('to must be after from');
  const room = await M.Room.findOne({ roomId: req.params.id }).lean(); if (!room) throw notFound('No such room');
  const active = await M.Allocation.find({ 'bed.roomId': room.roomId, status: { $in: ACTIVE }, checkIn: { $lt: to }, checkOut: { $gt: from } }).lean();
  const occupied = new Set(active.map((a) => a.bed.bedNo)); const slots = room.beds?.length ? room.beds.map((b,i) => ({ bedId:b.bedId, bedNo:Number(String(b.bedId).match(/(\d+)$/)?.[1] || i+1), status:b.status, available:b.status==='available' && !occupied.has(Number(String(b.bedId).match(/(\d+)$/)?.[1] || i+1)) })) : Array.from({length:room.capacity},(_,i)=>({bedNo:i+1,status:'available',available:!occupied.has(i+1)}));
  res.json({ roomId: room.roomId, from, to, roomStatus: room.status, beds: slots });
}));
accommodationApi.get('/accommodation/rooms/:id/history', requirePerm('accommodation:read'), ah(async (req, res) => { res.json({ allocations: await M.Allocation.find({ 'bed.roomId': req.params.id }).sort({ createdAt:-1 }).limit(500).lean() }); }));

// ---------------- allocation preview, automatic commit and manual placement
async function previewRun({ participantIds, contingentIds, strategy = 'balanced', exclude = [], reallocate = false } = {}) {
  const state = await loadState(); const selected = new Set(participantIds || []); const contingents = new Set(contingentIds || []); const exclusions = new Set(exclude);
  const activeAllocations = await M.Allocation.find({ status: { $in: ACTIVE } }).lean();
  const alreadyAllocated = new Set(activeAllocations.map((a) => a.participantId));
  const targets = state.people.filter((p) => (reallocate ? alreadyAllocated.has(p.participantId) : !alreadyAllocated.has(p.participantId)) && !exclusions.has(p.participantId) && (selected.size || contingents.size ? selected.has(p.participantId) || contingents.has(p.contingentId) : p.accommodationRequested === true));
  const targetIds = new Set(targets.map((p) => p.participantId));
  const pinned = activeAllocations.filter((a) => !targetIds.has(a.participantId));
  const run = accommodationRun(state, { people: targets, pinned, strategy, budgetMode: 'respect' });
  return { state, targets, run, alreadyAllocated: [...alreadyAllocated] };
}
async function liveRun() {
  const state=await loadState();
  const pinned=await M.Allocation.find({status:{$in:ACTIVE}}).lean();
  const pinnedIds=new Set(pinned.map(a=>a.participantId));
  const people=state.people.filter(p=>!pinnedIds.has(p.participantId));
  return {state,run:accommodationRun(state,{people,pinned})};
}
accommodationApi.post('/accommodation/allocate/preview', requirePerm('accommodation:write'), ah(async (req, res) => {
  const { state, run, alreadyAllocated } = await previewRun(req.body || {}); res.json({ preview: true, allocations: run.allocations, metrics: run.metrics, demand: run.allocations.length, alreadyAllocated, noChangesMade: true, capacities: { rooms: state.rooms.length, externalProperties: state.properties.length } });
}));
async function reserveAssignment(a, user, session, method = 'automatic') {
  const Allocation = M.Allocation; const model = a.bed.kind === 'hostel' ? M.Room : M.ExternalProperty;
  const key = a.bed.kind === 'hostel' ? { roomId: a.bed.roomId } : { propertyId: a.bed.propertyId };
  const validStatus = a.bed.kind === 'hostel' ? { status: { $in: ['ready','available'] } } : { status: { $in: ['available','active'] } };
  const created = new Allocation({ allocationId: `AL-${id()}`, ...a, status: 'confirmed', allocationMethod: method, allocatedBy: user.email });
  await created.save(session ? { session } : {});
  const bedId = `${a.bed.roomId || a.bed.propertyId}-B${a.bed.bedNo}`;
  const capFilter = a.bed.kind === 'hostel' ? { capacity: { $gte: a.bed.bedNo } } : { beds: { $gte: a.bed.bedNo } };
  const bedStatusFilter = a.bed.kind === 'hostel' ? { $or: [{ beds: { $exists: false } }, { beds: { $size: 0 } }, { beds: { $elemMatch: { bedId, status: 'available' } } }] } : {};
  const freeIntervalFilter = { $or: [{ reservations: { $exists: false } }, { reservations: { $not: { $elemMatch: { bedNo: a.bed.bedNo, status: { $in: ['reserved','confirmed','checked_in'] }, start: { $lt: a.checkOut }, end: { $gt: a.checkIn } } } } }] };
  const filter = { ...key, ...validStatus, ...capFilter, $and: [bedStatusFilter, freeIntervalFilter] };
  const update = { $push: { reservations: { allocationId: created._id, bedNo: a.bed.bedNo, participantId: a.participantId, start: a.checkIn, end: a.checkOut, status: 'confirmed' } }, $inc: { reservationVersion: 1 } };
  const reserved = await model.updateOne(filter, update, session ? { session } : {});
  if (!reserved.modifiedCount) { if (!session) await Allocation.deleteOne({ _id: created._id }); throw conflict(`Bed ${a.bed.bedNo} is no longer available`, { participantId: a.participantId, bed: a.bed }); }
  return created;
}
async function commitAutomaticAllocation(req) {
  if(req.body?.reallocate&&(!req.body?.reason||req.body.reason.trim().length<5))throw badRequest('Reallocation requires a reason of at least 5 characters');
  const { run, alreadyAllocated } = await previewRun(req.body || {}); const placed = run.allocations.filter((a) => a.status !== 'unplaced'); const batchId = `AB-${id()}`;
  return runCommand({ user: req.user, action: 'ACCOMMODATION_ALLOCATION_COMMITTED', entity: { type: 'AllocationBatch', id: batchId }, reason: req.body?.reason, risk: 'low', event: 'accommodation.allocations.committed' }, async (session) => {
    const docs = [];
    const moving = req.body?.reallocate ? await M.Allocation.find({ participantId: { $in: placed.map((a) => a.participantId) }, status: { $in: ACTIVE } }).session(session).lean() : [];
    try {
      if (moving.length) {
        await M.Allocation.updateMany({ _id: { $in: moving.map((a) => a._id) } }, { status: 'moved' }, session ? { session } : {});
        for (const old of moving) { const model=old.bed.kind==='hostel'?M.Room:M.ExternalProperty;const key=old.bed.kind==='hostel'?{roomId:old.bed.roomId}:{propertyId:old.bed.propertyId};await model.updateOne({...key,'reservations.allocationId':old._id},{$pull:{reservations:{allocationId:old._id}}},session?{session}:{}); }
      }
      for (const a of placed) {
        const doc = await reserveAssignment({ ...a, planId: req.body?.planId || null }, req.user, session, req.body?.reallocate ? 'reallocation' : 'automatic');
        const previous = moving.find((x) => x.participantId === a.participantId);
        if (previous) { doc.previousAllocationId = previous._id; await doc.save(session ? { session } : {}); }
        docs.push(doc);
      }
    }
    catch (error) {
      if (!session) {
        for (const d of docs) { const model=d.bed.kind==='hostel'?M.Room:M.ExternalProperty;const key=d.bed.kind==='hostel'?{roomId:d.bed.roomId}:{propertyId:d.bed.propertyId};await model.updateOne({...key,'reservations.allocationId':d._id},{$pull:{reservations:{allocationId:d._id}}});await M.Allocation.deleteOne({_id:d._id}); }
        for (const old of moving) { const model=old.bed.kind==='hostel'?M.Room:M.ExternalProperty;const key=old.bed.kind==='hostel'?{roomId:old.bed.roomId}:{propertyId:old.bed.propertyId};await M.Allocation.updateOne({_id:old._id},{status:old.status});await model.updateOne(key,{$push:{reservations:{allocationId:old._id,bedNo:old.bed.bedNo,participantId:old.participantId,start:old.checkIn,end:old.checkOut,status:old.status}}}); }
      }
      throw error;
    }
    return { summary: { batchId, allocated: docs.length, unallocated: run.metrics.unplaced, alreadyAllocated: alreadyAllocated.length, moved: moving.length }, result: { batchId, allocated: docs, moved: moving.map(a=>a.allocationId), unallocated: run.allocations.filter((a) => a.status === 'unplaced'), alreadyAllocated: req.body?.reallocate ? [] : alreadyAllocated, metrics: run.metrics } };
  });
}
accommodationApi.post('/accommodation/allocate/commit', requirePerm('accommodation:write'), ah(async (req, res) => res.status(201).json(await commitAutomaticAllocation(req))));
accommodationApi.post('/accommodation/allocate', requirePerm('accommodation:write'), ah(async (req, res) => {
  if (req.body?.dryRun !== false) { const { run } = await previewRun(req.body || {}); return res.json({ preview: true, allocations: run.allocations, metrics: run.metrics }); }
  return res.status(201).json(await commitAutomaticAllocation(req));
}));
accommodationApi.post('/accommodation/reallocate', requirePerm('accommodation:write'), ah(async (req, res) => { const { run } = await previewRun({ ...(req.body || {}), reallocate: true }); res.json({ preview: true, allocations: run.allocations, metrics: run.metrics, noChangesMade: true, note: 'Review, then POST the same participantIds to /api/accommodation/allocate/commit with reallocate:true.' }); }));
accommodationApi.post('/accommodation/allocate/manual', requirePerm('accommodation:write'), ah(async (req, res) => {
  const { participantId, roomId, propertyId, bedNo, checkIn, checkOut, reason } = req.body || {};
  if (!participantId || !Number.isInteger(Number(bedNo))) throw badRequest('participantId and numeric bedNo are required');
  const p = await M.Participant.findOne({ participantId, active: true }).lean(); if (!p) throw notFound('No active participant');
  if (await M.Allocation.exists({ participantId, status: { $in: ACTIVE } })) throw conflict('Participant already has an active allocation; use the move endpoint to change beds');
  const start = checkIn ? validDate(checkIn,'checkIn') : p.arrivalDateTime, end = checkOut ? validDate(checkOut,'checkOut') : p.departureDateTime;
  if (!start || !end || new Date(end) <= new Date(start)) throw badRequest('Valid checkIn and checkOut dates are required');
  let room, prop, bed;
  if (roomId) { room = await M.Room.findOne({ roomId }).lean(); if (!room) throw notFound('No such room'); if(room.propertyId&&await M.ExternalProperty.exists({propertyId:room.propertyId,propertyType:{$ne:'college_hostel'}}))throw badRequest('Use propertyId for external contracted beds'); bed = { kind:'hostel',roomId,bedNo:Number(bedNo),site:'campus',group:room.block }; }
  else if (propertyId) { prop = await M.ExternalProperty.findOne({ propertyId }).lean(); if (!prop) throw notFound('No such property'); bed = { kind:'external',propertyId,bedNo:Number(bedNo),site:propertyId,group:propertyId }; }
  else throw badRequest('roomId or propertyId is required');
  if (room) {
    if (!['ready','available'].includes(room.status)) throw conflict(`Room ${roomId} is not ready`);
    if (Number(bedNo) > room.capacity || Number(bedNo) < 1) throw badRequest('bedNo is outside room capacity');
    const slot = room.beds?.find((b) => b.bedId === `${roomId}-B${bedNo}`);
    if (slot && slot.status !== 'available') throw conflict('Requested bed is blocked or under maintenance');
    if (p.housingCategory === 'female' && !['girls','all_gender'].includes(room.gender)) throw conflict('Room gender policy is incompatible');
    if (p.housingCategory === 'male' && !['boys','all_gender'].includes(room.gender)) throw conflict('Room gender policy is incompatible');
    if (p.accessibilityNeeds?.status === 'declared' && room.accessibility !== 'yes') throw conflict('Room accessibility is not confirmed suitable');
  }
  if (prop) {
    if (!['available','active'].includes(prop.status) || Number(bedNo) > Number(prop.contractedBedCapacity ?? prop.beds) || Number(bedNo) < 1) throw conflict('External bed is unavailable or outside contracted capacity');
    if (p.accessibilityNeeds?.status === 'declared' && prop.accessibility !== 'yes') throw conflict('Property accessibility is not confirmed suitable');
    if (prop.genderPolicy === 'girls' && p.housingCategory !== 'female' || prop.genderPolicy === 'boys' && p.housingCategory !== 'male') throw conflict('Property gender policy is incompatible');
  }
  if (!reason || reason.trim().length < 5) throw badRequest('Manual allocation requires a reason of at least 5 characters');
  const target = { participantId,contingentId:p.contingentId,personType:p.personType,bed,checkIn:start,checkOut:end,nights:nightKeys(start,end).length,costPerNight:prop?.costPerBedPerNight||0,cost:(prop?.costPerBedPerNight||0)*nightKeys(start,end).length,reasonCodes:['MANUAL_ALLOCATION'],relaxed:[] };
  const result = await runCommand({ user:req.user,action:'ACCOMMODATION_MANUAL_ALLOCATION',entity:{type:'Participant',id:participantId},reason,risk:'medium',event:'accommodation.allocation.manual' },async(session)=>({summary:{participantId,bed},result:await reserveAssignment(target,req.user,session,'manual')})); res.status(201).json(result);
}));

// ---------------- allocations and reports
accommodationApi.get('/accommodation/allocations', requirePerm('accommodation:read'), ah(async (req,res)=>{ const q={}; for(const k of ['participantId','contingentId','status']) if(req.query[k]) q[k]=req.query[k]; const {page,limit}=parsePage(req.query); const [rows,total]=await Promise.all([M.Allocation.find(q).sort({createdAt:-1}).skip((page-1)*limit).limit(limit).lean(),M.Allocation.countDocuments(q)]); res.json(apiResult(total,rows,page,limit)); }));
accommodationApi.get('/accommodation/active',requirePerm('accommodation:read'),ah(async(_req,res)=>{const [plan,allocations]=await Promise.all([activePlan('accommodation'),M.Allocation.find({status:{$in:ACTIVE}}).sort({participantId:1}).lean()]);res.json({plan:plan?{planId:plan.planId,strategy:plan.strategy,metrics:plan.metrics,status:plan.status}:null,allocations});}));
accommodationApi.get('/accommodation/allocations/report', requirePerm('accommodation:read'), ah(async (_req,res)=>{ const rows=await M.Allocation.aggregate([{ $group:{_id:'$status',count:{$sum:1},cost:{$sum:'$cost'}} }]); res.json({byStatus:rows}); }));
accommodationApi.get('/accommodation/allocations/:id', requirePerm('accommodation:read'), ah(async(req,res)=>{ const a=await M.Allocation.findOne({$or:[{allocationId:req.params.id},{_id:req.params.id.match(/^[0-9a-f]{24}$/i)?req.params.id:null}]}).lean(); if(!a) throw notFound('No such allocation'); res.json({allocation:a}); }));
accommodationApi.get('/accommodation/unallocated', requirePerm('accommodation:read'), ah(async(_req,res)=>{ const active=await activePlan('accommodation'); const rows=active?await M.Allocation.find({planId:active.planId,status:'unplaced'}).lean():[]; res.json({rows}); }));
accommodationApi.get('/accommodation/shortages', requirePerm('accommodation:read'), ah(async(_req,res)=>{ const {run}=await liveRun(); res.json({metrics:run.metrics,unallocated:run.allocations.filter(a=>a.status==='unplaced')}); }));
accommodationApi.get('/accommodation/shortages/daily', requirePerm('accommodation:read'), ah(async(_req,res)=>{ const {run}=await liveRun(); res.json({days:run.metrics.perNight}); }));
accommodationApi.get('/accommodation/shortages/by-contingent', requirePerm('accommodation:read'), ah(async(_req,res)=>{ const active=await activePlan('accommodation'); const rows=await M.Allocation.aggregate([{ $match:{...(active?{planId:active.planId}:{}),status:'unplaced'}},{ $group:{_id:'$contingentId',unallocated:{$sum:1},reasons:{$push:'$reasonCodes'}}}]); res.json({contingents:rows}); }));
accommodationApi.get('/accommodation/capacity', requirePerm('accommodation:read'), ah(async(_req,res)=>{ const [rooms,props]=await Promise.all([M.Room.find({}).lean(),M.ExternalProperty.find({}).lean()]); const hostel=rooms.filter(r=>['ready','available'].includes(r.status)).reduce((s,r)=>s+(r.beds?.length?r.beds.filter(b=>b.status==='available').length:Number(r.capacity||0)),0); const external=props.filter(p=>['available','active'].includes(p.status)&&p.propertyType!=='college_hostel').reduce((s,p)=>s+Number(p.contractedBedCapacity??p.beds??0),0); res.json({physicalBeds:rooms.reduce((s,r)=>s+Number(r.capacity||0),0)+props.filter(p=>p.propertyType!=='college_hostel').reduce((s,p)=>s+Number(p.beds||0),0),usableBeds:hostel+external,campusBeds:hostel,contractedExternalBeds:external}); }));
accommodationApi.get('/accommodation/capacity/forecast', requirePerm('accommodation:read'), ah(async(_req,res)=>{ const {run}=await liveRun(); res.json({forecast:run.metrics.perNight}); }));
accommodationApi.get('/accommodation/costs/summary', requirePerm('accommodation:read'), ah(async(_req,res)=>{ const properties=await M.ExternalProperty.find({}).lean(); const allocations=await M.Allocation.find({status:{$in:ACTIVE},'bed.kind':'external'}).lean(); const estimated=properties.reduce((s,p)=>s+propertyCostSummary(p,allocations.filter(a=>a.bed?.propertyId===p.propertyId)).total,0); res.json({currency:'INR',estimated,actual:properties.reduce((s,p)=>s+Number(p.actualExpenditure||0),0),allocatedExternal:allocations.length}); }));
accommodationApi.get('/accommodation/costs/properties', requirePerm('accommodation:read'), ah(async(_req,res)=>{ const properties=await M.ExternalProperty.find({}).lean(); const allocations=await M.Allocation.find({status:{$in:ACTIVE},'bed.kind':'external'}).lean(); const rows=properties.map(p=>({propertyId:p.propertyId,...propertyCostSummary(p,allocations.filter(a=>a.bed?.propertyId===p.propertyId)),actual:Number(p.actualExpenditure||0),participants:allocations.filter(a=>a.bed?.propertyId===p.propertyId).length})); res.json({rows,currency:'INR'}); }));
accommodationApi.get('/accommodation/costs/contingents', requirePerm('accommodation:read'), ah(async(_req,res)=>{ const properties=await M.ExternalProperty.find({}).lean(); const rows=await M.Allocation.aggregate([{ $match:{status:{$in:ACTIVE},'bed.kind':'external'}},{ $group:{_id:'$contingentId',participants:{$sum:1},estimated:{$sum:'$cost'}}}]); res.json({rows,currency:'INR'}); }));
accommodationApi.get('/accommodation/costs/daily', requirePerm('accommodation:read'), ah(async(_req,res)=>{ const [allocations,properties]=await Promise.all([M.Allocation.find({status:{$in:ACTIVE},'bed.kind':'external'}).lean(),M.ExternalProperty.find({}).lean()]); const pBy=new Map(properties.map(p=>[p.propertyId,p])); const by={}; for(const a of allocations){const p=pBy.get(a.bed.propertyId);const rate=Number(p?.basePrice??p?.costPerBedPerNight??a.costPerNight??0);for(const day of nightKeys(a.checkIn,a.checkOut)){const key=p?.costModel==='per_room_per_night'?`${day}|${a.bed.propertyId}`:`${day}|${a.bed.propertyId}|${a.participantId}`;by[key]={date:day,propertyId:a.bed.propertyId,base:rate};}} const daily={};for(const x of Object.values(by))daily[x.date]=(daily[x.date]||0)+x.base;res.json({daily:Object.entries(daily).map(([date,cost])=>({date,cost})),currency:'INR'}); }));
accommodationApi.post('/accommodation/costs/calculate', requirePerm('accommodation:read'), ah(async(req,res)=>{const p=await M.ExternalProperty.findOne({propertyId:req.body?.propertyId}).lean();if(!p)throw notFound('No such property'); const a={checkIn:validDate(req.body.checkIn,'checkIn'),checkOut:validDate(req.body.checkOut,'checkOut'),costPerNight:p.costPerBedPerNight};if(a.checkOut<=a.checkIn)throw badRequest('checkOut must be after checkIn');res.json({propertyId:p.propertyId,currency:'INR',...estimateCost(a,p)});}));

// ---------------- check-in/out lifecycle and housekeeping
async function checkInOne(participantId, user, reason, emergency=false, session=null) {
  const p=await M.Participant.findOne({participantId,active:true}).lean(); if(!p)throw notFound('No active participant');
  const a=await M.Allocation.findOne({participantId,status:{$in:['confirmed','reserved']},checkIn:{$lte:new Date()},checkOut:{$gt:new Date()}}).sort({createdAt:-1}).lean(); if(!a)throw conflict('Participant has no current confirmed accommodation allocation');
  if(a.bed.kind==='hostel'){const r=await M.Room.findOne({roomId:a.bed.roomId}).lean();if(!r)throw notFound('Allocated room no longer exists');if(!['ready','available'].includes(r.status)&&!emergency)throw conflict(`Room is ${r.status}; check-in requires a ready room`);}
  else { const property=await M.ExternalProperty.findOne({propertyId:a.bed.propertyId}).lean();if(!property)throw notFound('Allocated property no longer exists');if(!['available','active'].includes(property.status)&&!emergency)throw conflict(`Property is ${property.status}; check-in is unavailable`); }
  const updated=await M.Allocation.findOneAndUpdate({_id:a._id,status:{$in:['confirmed','reserved']}},{$set:{status:'checked_in',checkInAt:new Date()}},{new:true,...(session?{session}:{})}); if(!updated)throw conflict('Allocation was checked in concurrently');
  const opts=session?{session}:{};
  const readiness=a.bed.kind==='hostel'&&!emergency?{status:{$in:['ready','available']}}:a.bed.kind==='external'&&!emergency?{status:{$in:['available','active']}}:{};
  const roomFilter=a.bed.kind==='hostel'?{roomId:a.bed.roomId,...readiness,'reservations.allocationId':a._id}:{propertyId:a.bed.propertyId,...readiness,'reservations.allocationId':a._id};
  const roomModel=a.bed.kind==='hostel'?M.Room:M.ExternalProperty;
  const bedUpdated=await roomModel.updateOne(roomFilter,{$set:{'reservations.$.status':'checked_in'}},opts);
  if(!bedUpdated.modifiedCount){await M.Allocation.updateOne({_id:a._id,status:'checked_in'},{$set:{status:a.status},$unset:{checkInAt:1}},opts);throw conflict('The room or property readiness changed during check-in; refresh and try again');}
  await M.Participant.updateOne({participantId},{checkInStatus:'checked_in'},opts);
  return updated;
}
accommodationApi.post('/accommodation/check-in', requirePerm('accommodation:write'), ah(async(req,res)=>{const {participantId,reason,emergencyOverride}=req.body||{}; if(!participantId)throw badRequest('participantId is required');if(emergencyOverride&&(!reason||reason.trim().length<5))throw badRequest('Emergency override requires a reason');const result=await runCommand({user:req.user,action:'ACCOMMODATION_CHECK_IN',entity:{type:'Participant',id:participantId},reason,risk:emergencyOverride?'medium':'low',event:'accommodation.checkin'},async(session)=>({summary:{participantId,emergencyOverride:Boolean(emergencyOverride)},result:await checkInOne(participantId,req.user,reason,Boolean(emergencyOverride),session)}));res.json(result);}));
accommodationApi.post('/accommodation/check-in/bulk', requirePerm('accommodation:write'), ah(async(req,res)=>{const ids=req.body?.participantIds;if(!Array.isArray(ids)||!ids.length||ids.length>500)throw badRequest('participantIds must contain 1 to 500 IDs');const results=[];for(const participantId of ids){try{results.push({participantId,allocation:await checkInOne(participantId,req.user)});}catch(e){results.push({participantId,error:e.message});}}res.json({results,checkedIn:results.filter(x=>x.allocation).length,exceptions:results.filter(x=>x.error)});}));
accommodationApi.post('/accommodation/check-out', requirePerm('accommodation:write'), ah(async(req,res)=>{const {participantId,early,reason}=req.body||{};const a=await M.Allocation.findOne({participantId,status:'checked_in'}).sort({createdAt:-1});if(!a)throw conflict('Participant is not currently checked in');const result=await runCommand({user:req.user,action:'ACCOMMODATION_CHECK_OUT',entity:{type:'Participant',id:participantId},reason,risk:'low',event:'accommodation.checkout'},async(session)=>{a.status='checked_out';a.checkOutAt=new Date();if(early)a.checkOut=new Date();await a.save(session?{session}:{});const model=a.bed.kind==='hostel'?M.Room:M.ExternalProperty;const key=a.bed.kind==='hostel'?{roomId:a.bed.roomId}:{propertyId:a.bed.propertyId};await model.updateOne({...key,'reservations.allocationId':a._id},{$pull:{reservations:{allocationId:a._id}},$inc:{reservationVersion:1}},session?{session}:{});await M.Participant.updateOne({participantId},{checkInStatus:'absent'},session?{session}:{});let task=null;if(a.bed.kind==='hostel'){const r=await M.Room.findOneAndUpdate(key,{status:'cleaning_required'},{new:true,session});task=await M.HousekeepingTask.create([{taskId:`HK-${id()}`,roomId:a.bed.roomId,propertyId:r?.propertyId,taskType:'cleaning',priority:'high',status:'pending',createdBy:req.user.email}],session?{session}:{});}return {summary:{participantId,allocationId:a.allocationId},result:{allocation:a,housekeepingTask:task?.[0]||null}};});res.json(result);}));
accommodationApi.post('/accommodation/no-show',requirePerm('accommodation:write'),ah(async(req,res)=>{const {participantId,reason}=req.body||{};if(!participantId)throw badRequest('participantId is required');const a=await M.Allocation.findOne({participantId,status:{$in:['confirmed','reserved']}}).sort({createdAt:-1});if(!a)throw notFound('No upcoming allocation');if(new Date(a.checkIn)>new Date())throw conflict('Cannot mark a future arrival as a no-show');const out=await runCommand({user:req.user,action:'ACCOMMODATION_NO_SHOW',entity:{type:'Participant',id:participantId},reason,risk:'low',event:'accommodation.no_show'},async(session)=>{a.status='no_show';await a.save(session?{session}:{});const model=a.bed.kind==='hostel'?M.Room:M.ExternalProperty;const key=a.bed.kind==='hostel'?{roomId:a.bed.roomId}:{propertyId:a.bed.propertyId};await model.updateOne({...key,'reservations.allocationId':a._id},{$pull:{reservations:{allocationId:a._id}}},session?{session}:{});await M.Participant.updateOne({participantId},{checkInStatus:'absent'},session?{session}:{});return {summary:{participantId,allocationId:a.allocationId},result:{allocation:a}};});res.json(out);}));
accommodationApi.post('/accommodation/check-out/bulk', requirePerm('accommodation:write'), ah(async(req,res)=>{const ids=req.body?.participantIds;if(!Array.isArray(ids)||!ids.length||ids.length>500)throw badRequest('participantIds must contain 1 to 500 IDs');const results=[];for(const participantId of ids){try{const a=await M.Allocation.findOne({participantId,status:'checked_in'}).sort({createdAt:-1});if(!a)throw conflict('Not checked in');a.status='checked_out';a.checkOutAt=new Date();await a.save();if(a.bed.kind==='hostel'){await M.Room.updateOne({roomId:a.bed.roomId,'reservations.allocationId':a._id},{$pull:{reservations:{allocationId:a._id}}});await M.Room.updateOne({roomId:a.bed.roomId},{status:'cleaning_required'});await M.HousekeepingTask.create({taskId:`HK-${id()}`,roomId:a.bed.roomId,taskType:'cleaning',priority:'normal',createdBy:req.user.email});}results.push({participantId,checkedOut:true});}catch(e){results.push({participantId,error:e.message});}}res.json({results,exceptions:results.filter(r=>r.error)});}));
for (const [path, statuses] of [['check-in/pending',['confirmed','reserved']],['check-in/completed',['checked_in']],['check-out/pending',['checked_in']],['check-out/completed',['checked_out']]]) accommodationApi.get(`/accommodation/${path}`,requirePerm('accommodation:read'),ah(async(req,res)=>{const {page,limit}=parsePage(req.query);const q={status:{$in:statuses}};const [rows,total]=await Promise.all([M.Allocation.find(q).sort({checkIn:1}).skip((page-1)*limit).limit(limit).lean(),M.Allocation.countDocuments(q)]);res.json(apiResult(total,rows,page,limit));}));
accommodationApi.get('/accommodation/exceptions',requirePerm('accommodation:read'),ah(async(_req,res)=>{const rows=await M.Allocation.find({$or:[{status:'unplaced'},{status:'no_show'}]}).limit(500).lean();res.json({rows});}));

accommodationApi.post('/accommodation/housekeeping/tasks',requirePerm('accommodation:write'),ah(async(req,res)=>{const b=req.body||{};if(!b.roomId||!await M.Room.exists({roomId:b.roomId}))throw badRequest('Existing roomId is required');const task=await M.HousekeepingTask.create({taskId:b.taskId||`HK-${id()}`,roomId:b.roomId,propertyId:b.propertyId,taskType:b.taskType||'cleaning',priority:b.priority||'normal',assignedStaffId:b.assignedStaffId,createdBy:req.user.email,cleaningNotes:b.cleaningNotes});await audit(req,'ACCOMMODATION_HOUSEKEEPING_CREATED','HousekeepingTask',task.taskId,{roomId:task.roomId,taskType:task.taskType});res.status(201).json({task});}));
accommodationApi.get('/accommodation/housekeeping/tasks',requirePerm('accommodation:read'),ah(async(req,res)=>{const q={};for(const k of ['roomId','propertyId','status','taskType','assignedStaffId'])if(req.query[k])q[k]=req.query[k];const {page,limit}=parsePage(req.query);const [rows,total]=await Promise.all([M.HousekeepingTask.find(q).sort({priority:-1,createdAt:1}).skip((page-1)*limit).limit(limit).lean(),M.HousekeepingTask.countDocuments(q)]);res.json(apiResult(total,rows,page,limit));}));
accommodationApi.get('/accommodation/housekeeping/tasks/:id',requirePerm('accommodation:read'),ah(async(req,res)=>{const task=await M.HousekeepingTask.findOne({taskId:req.params.id}).lean();if(!task)throw notFound('No such task');res.json({task});}));
for(const [action,status] of [['assign','assigned'],['start','in_progress'],['complete','completed'],['verify','verified']])accommodationApi.patch(`/accommodation/housekeeping/tasks/:id/${action}`,requirePerm('accommodation:write'),ah(async(req,res)=>{const task=await M.HousekeepingTask.findOne({taskId:req.params.id});if(!task)throw notFound('No such task');const transitions={assigned:['pending','assigned'],in_progress:['assigned','pending','in_progress'],completed:['in_progress','assigned'],verified:['completed']};if(!transitions[status].includes(task.status))throw conflict(`Cannot ${action} a task in ${task.status} status`);task.status=status;if(status==='assigned')task.assignedStaffId=req.body?.assignedStaffId||task.assignedStaffId;if(status==='in_progress')task.startedAt=new Date();if(status==='completed'){task.completedAt=new Date();task.cleaningNotes=req.body?.notes||task.cleaningNotes;await M.Room.updateOne({roomId:task.roomId},{status:'inspection_pending'});}if(status==='verified'){task.verifiedBy=req.user.email;await M.Room.updateOne({roomId:task.roomId},{status:'ready',lastCleanedAt:task.completedAt,lastInspectedAt:new Date()});}await task.save();await audit(req,`ACCOMMODATION_HOUSEKEEPING_${status.toUpperCase()}`,'HousekeepingTask',task.taskId,{roomId:task.roomId,status:task.status});res.json({task});}));
accommodationApi.get('/accommodation/housekeeping/dashboard',requirePerm('accommodation:read'),ah(async(_req,res)=>{const byStatus=await M.HousekeepingTask.aggregate([{$group:{_id:'$status',count:{$sum:1}}}]);const rooms=await M.Room.aggregate([{$group:{_id:'$status',count:{$sum:1}}}]);res.json({tasks:byStatus,rooms});}));
accommodationApi.get('/accommodation/rooms/readiness',requirePerm('accommodation:read'),ah(async(_req,res)=>{res.json({rooms:await M.Room.find({status:{$in:['dirty','cleaning_required','cleaning_in_progress','cleaned','inspection_pending','maintenance','blocked']}}).sort({status:1}).lean()});}));

// ---------------- manual moves and history-preserving cancellations
accommodationApi.post('/accommodation/allocations/:id/move',requirePerm('accommodation:write'),ah(async(req,res)=>{
  const old=await M.Allocation.findOne({$or:[{allocationId:req.params.id},{_id:req.params.id.match(/^[0-9a-f]{24}$/i)?req.params.id:null}],status:{$in:ACTIVE}});
  if(!old)throw notFound('No active allocation');
  const reason=req.body?.reason;if(!reason||reason.trim().length<5)throw badRequest('A reason (at least 5 characters) is required');
  const p=await M.Participant.findOne({participantId:old.participantId}).lean();if(!p)throw notFound('Participant record no longer exists');
  const destination=await validateManualBed(p,req.body?.bed,old.checkIn,old.checkOut);
  const target={...old.toObject(),bed:destination,checkIn:old.checkIn,checkOut:old.checkOut};
  const out=await runCommand({user:req.user,action:'ACCOMMODATION_ALLOCATION_MOVED',entity:{type:'Allocation',id:old.allocationId},reason,risk:'medium',event:'accommodation.allocation.moved'},async(session)=>{
    const newDoc=await reserveAssignment(target,req.user,session,'reallocation');newDoc.previousAllocationId=old._id;newDoc.manualOverrideReason=reason;await newDoc.save(session?{session}:{});
    old.status='moved';await old.save(session?{session}:{});const model=old.bed.kind==='hostel'?M.Room:M.ExternalProperty;const key=old.bed.kind==='hostel'?{roomId:old.bed.roomId}:{propertyId:old.bed.propertyId};
    await model.updateOne({...key,'reservations.allocationId':old._id},{$pull:{reservations:{allocationId:old._id}}},session?{session}:{});
    return {summary:{from:old.bed,to:newDoc.bed,participantId:p.participantId},result:{previous:old,current:newDoc}};
  });res.json(out);
}));
accommodationApi.post('/accommodation/allocations/:id/cancel',requirePerm('accommodation:write'),ah(async(req,res)=>{const a=await M.Allocation.findOne({$or:[{allocationId:req.params.id},{_id:req.params.id.match(/^[0-9a-f]{24}$/i)?req.params.id:null}],status:{$in:ACTIVE}});if(!a)throw notFound('No active allocation');const reason=req.body?.reason;if(!reason||reason.trim().length<5)throw badRequest('A reason (at least 5 characters) is required');const out=await runCommand({user:req.user,action:'ACCOMMODATION_ALLOCATION_CANCELLED',entity:{type:'Allocation',id:a.allocationId},reason,risk:'low',event:'accommodation.allocation.cancelled'},async(session)=>{a.status='cancelled';await a.save(session?{session}:{});const model=a.bed.kind==='hostel'?M.Room:M.ExternalProperty;const key=a.bed.kind==='hostel'?{roomId:a.bed.roomId}:{propertyId:a.bed.propertyId};await model.updateOne({...key,'reservations.allocationId':a._id},{$pull:{reservations:{allocationId:a._id}}},session?{session}:{});return {summary:{participantId:a.participantId},result:{allocation:a}};});res.json(out);}));
accommodationApi.post('/accommodation/allocations/:id/override',requirePerm('accommodation:write'),ah(async(req,res)=>{const a=await M.Allocation.findOne({allocationId:req.params.id});if(!a)throw notFound('No allocation');if(!req.body?.reason||req.body.reason.trim().length<5)throw badRequest('Override reason is required');const result=await runCommand({user:req.user,action:'ACCOMMODATION_ALLOCATION_OVERRIDE',entity:{type:'Allocation',id:a.allocationId},reason:req.body.reason,risk:'medium',event:'accommodation.allocation.override'},async(session)=>{a.manualOverrideReason=req.body.reason;await a.save(session?{session}:{});return {summary:{participantId:a.participantId,allocationId:a.allocationId},result:{allocation:a}};});res.json(result);}));
accommodationApi.get('/accommodation/allocations/:id/history',requirePerm('accommodation:read'),ah(async(req,res)=>{const a=await M.Allocation.findOne({$or:[{allocationId:req.params.id},{_id:req.params.id.match(/^[0-9a-f]{24}$/i)?req.params.id:null}]}).lean();if(!a)throw notFound('No allocation');const history=await M.Allocation.find({$or:[{_id:a._id},{previousAllocationId:a._id},{participantId:a.participantId}]}).sort({createdAt:1}).lean();res.json({participantId:a.participantId,history});}));

// ---------------- dashboard and disruption preview/approval
accommodationApi.get('/accommodation/dashboard',requirePerm('accommodation:read'),ah(async(_req,res)=>{const [people,allocs,rooms,props,tasks,forecast]=await Promise.all([M.Participant.find({active:true,accommodationRequested:true}).select('participantId contingentId checkInStatus').lean(),M.Allocation.find({status:{$in:ACTIVE}}).lean(),M.Room.find({}).lean(),M.ExternalProperty.find({}).lean(),M.HousekeepingTask.countDocuments({status:{$in:['pending','assigned','in_progress']}}),liveRun()]);const checked=allocs.filter(a=>a.status==='checked_in').length;const campus=allocs.filter(a=>a.bed.kind==='hostel'&&a.status==='checked_in').length;const external=allocs.filter(a=>a.bed.kind==='external'&&a.status==='checked_in').length;const ready=rooms.filter(r=>['ready','available'].includes(r.status)).length;res.json({demand:people.length,allocated:allocs.length,unallocated:forecast.run.metrics.unplaced,checkedIn:checked,pendingCheckIn:allocs.filter(a=>['confirmed','reserved'].includes(a.status)).length,checkedOut:await M.Allocation.countDocuments({status:'checked_out'}),campusOccupancy:campus,externalOccupancy:external,physicalBeds:rooms.reduce((s,r)=>s+r.capacity,0)+props.filter(p=>p.propertyType!=='college_hostel').reduce((s,p)=>s+(p.beds||0),0),usableBeds:rooms.filter(r=>['ready','available'].includes(r.status)).reduce((s,r)=>s+(r.beds?.length?r.beds.filter(b=>b.status==='available').length:r.capacity),0)+props.filter(p=>['available','active'].includes(p.status)&&p.propertyType!=='college_hostel').reduce((s,p)=>s+(p.contractedBedCapacity??p.beds??0),0),roomsRequiringCleaning:tasks,roomsReady:ready,shortages:forecast.run.metrics.perNight,estimatedExternalCost:allocs.filter(a=>a.bed.kind==='external').reduce((s,a)=>s+(a.cost||0),0),contingents:await M.Allocation.aggregate([{$match:{status:{$in:ACTIVE}}},{$group:{_id:'$contingentId',allocated:{$sum:1},checkedIn:{$sum:{$cond:[{$eq:['$status','checked_in']},1,0]}}}}])});}));
accommodationApi.post('/accommodation/simulate-disruption',requirePerm('disruptions:preview'),ah(async(req,res)=>{const {type,propertyId,roomId,bedReduction=0}=req.body||{};if(!['hostel_closure','room_maintenance','property_shutdown','bed_capacity_reduction','demand_increase','accessibility_room_loss'].includes(type))throw badRequest('Unsupported accommodation disruption type');const query=roomId?{'bed.roomId':roomId}:propertyId?{'bed.propertyId':propertyId}:null;const affected=query?await M.Allocation.find({...query,status:{$in:ACTIVE}}).lean():[];let capacityLost=0;if(roomId){const r=await M.Room.findOne({roomId}).lean();if(!r)throw notFound('No such room');capacityLost=type==='bed_capacity_reduction'?Math.min(Number(bedReduction),r.capacity):r.capacity;}else if(propertyId){const p=await M.ExternalProperty.findOne({propertyId}).lean();if(!p)throw notFound('No such property');capacityLost=Number(p.contractedBedCapacity??p.beds??0);}const preview={type,affectedAllocations:affected.length,affectedParticipants:affected.map(a=>a.participantId),capacityLost,manualIntervention:affected.map(a=>({participantId:a.participantId,reason:`${type} may affect bed ${a.bed?.bedNo}`,suggestedAction:'Review and use the reallocation preview before moving this participant.'}))};const disruption=await M.Disruption.create({disruptionId:`AD-${id()}`,type:`accommodation:${type}`,params:{propertyId,roomId,bedReduction},status:'previewed',preview,createdBy:{userId:req.user.userId,role:req.user.role}});await audit(req,'ACCOMMODATION_DISRUPTION_PREVIEWED','Disruption',disruption.disruptionId,{type,capacityLost,affected:affected.length});res.status(201).json({disruption,preview,noLiveChanges:true});}));
accommodationApi.get('/accommodation/disruptions',requirePerm('disruptions:read'),ah(async(req,res)=>{res.json({disruptions:await M.Disruption.find({type:/^accommodation:/}).sort({createdAt:-1}).limit(200).lean()});}));
accommodationApi.post('/accommodation/disruptions/:id/approve',requirePerm('disruptions:commit'),ah(async(req,res)=>{const d=await M.Disruption.findOne({disruptionId:req.params.id,type:/^accommodation:/});if(!d)throw notFound('No such accommodation disruption');if(d.status!=='previewed')throw conflict('Disruption must be previewed before approval');d.status='committed';d.committedBy={userId:req.user.userId,role:req.user.role};d.reason=req.body?.reason||'';d.committedAt=new Date();await d.save();await audit(req,'ACCOMMODATION_DISRUPTION_APPROVED','Disruption',d.disruptionId,{type:d.type},d.reason);res.json({disruption:d,approved:true});}));
accommodationApi.post('/accommodation/disruptions/:id/execute',requirePerm('disruptions:commit'),ah(async(req,res)=>{const d=await M.Disruption.findOne({disruptionId:req.params.id,type:/^accommodation:/});if(!d)throw notFound('No such accommodation disruption');if(d.status!=='committed')throw conflict('Disruption must be approved first');if(d.result?.executedAt)throw conflict('Disruption was already executed');const type=d.type.replace('accommodation:','');if(type==='hostel_closure'||type==='room_maintenance'){const patch=type==='room_maintenance'?{status:'maintenance'}:{status:'closed'};const r=await M.Room.findOneAndUpdate({roomId:d.params.roomId},{$set:patch},{new:true});if(!r)throw notFound('Affected room no longer exists');}else if(type==='property_shutdown'){const p=await M.ExternalProperty.findOneAndUpdate({propertyId:d.params.propertyId},{status:'closed'},{new:true});if(!p)throw notFound('Affected property no longer exists');}else if(type==='bed_capacity_reduction'&&d.params.roomId){const room=await M.Room.findOne({roomId:d.params.roomId});if(!room)throw notFound('Affected room no longer exists');const capacity=Math.max(0,room.capacity-Number(d.params.bedReduction||0));if((room.reservations||[]).some(x=>x.bedNo>capacity&&ACTIVE.includes(x.status)))throw conflict('Cannot reduce capacity below an active reserved bed');room.capacity=capacity;room.beds=(room.beds||[]).filter((_,i)=>i<capacity);await room.save();}else throw badRequest('This disruption type is preview-only; use the suggested recovery workflow and do not execute it through this endpoint');d.result={executedAt:new Date(),executedBy:req.user.email,summary:d.preview};await d.save();await audit(req,'ACCOMMODATION_DISRUPTION_EXECUTED','Disruption',d.disruptionId,{type:d.type,summary:d.preview},d.reason);emit('accommodation.disruption.executed',{entity:{type:'Disruption',id:d.disruptionId},summary:d.preview,at:new Date()});res.json({executed:true,disruption:d});}));

