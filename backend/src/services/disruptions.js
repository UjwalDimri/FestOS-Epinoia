// Disruption engine: every live-test scenario is preview -> commit.
// preview() reads state and computes impact WITHOUT writing. commit() recomputes, then writes inside runCommand (audited).
import * as M from '../models/index.js';
import { loadState, accommodationRun, scheduleRun, foodRun, activePlan } from './state.js';
import { runCommand } from './command.js';
import { buildSchedulePlan, activateAccommodationPlan } from './plans.js';
import { issueMerch } from './merch.js';
import { parseIST, fmtIST, overlaps, addMinutes } from '../utils/time.js';
import { badRequest, notFound } from '../utils/errors.js';
import { DISRUPTION_COMMITTERS } from '../shared/roles.js';
import { templateExplanation } from './explain.js';
import { arrivalAfterDelay, assertDisruptionTransactionsSupported, validateDisruptionParams } from './disruptionValidation.js';
import { supportsTransactions } from '../config/db.js';

const money = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// ---------- helpers
function withClosure(list, key, closure) {
  return list.map((x) => (key(x) ? { ...x, closures: [...(x.closures || []), closure] } : x));
}

async function currentAccommodation() {
  const plan = await activePlan('accommodation');
  if (!plan) throw badRequest('No active accommodation plan. Generate and activate one first.');
  const allocs = await M.Allocation.find({ planId: plan.planId, status: { $ne: 'released' } }).lean();
  return { plan, allocs };
}

const placedOnly = (a) => a.filter((x) => x.bed?.kind && x.status !== 'unplaced');

// ---------- 1. Hostel closure (pipe burst, power failure)
async function previewHostelClosure(state, p) {
  const from = p.from ? parseIST(p.from) : parseIST(state.assumptions.festWindow.start);
  const to = p.to ? parseIST(p.to) : parseIST(state.assumptions.festWindow.end);
  if (!from || !to) throw badRequest('from/to must be "YYYY-MM-DD HH:mm" IST');
  const target = (r) => (p.roomId ? r.roomId === p.roomId : p.block ? r.block === p.block : false);
  const roomIds = new Set(state.rooms.filter(target).map((r) => r.roomId));
  if (!roomIds.size) throw notFound('No room matches that roomId or block');
  const closure = { start: from, end: to, reason: 'Closed by Hospitality', disruptionId: p.__id || 'pending' };
  const rooms = withClosure(state.rooms, target, closure);
  const { plan, allocs } = await currentAccommodation();
  const displaced = placedOnly(allocs).filter((a) => a.bed.kind === 'hostel' && roomIds.has(a.bed.roomId) && overlaps(a.checkIn, a.checkOut, from, to));
  const displacedIds = new Set(displaced.map((a) => a.participantId));
  const pinned = placedOnly(allocs).filter((a) => !displacedIds.has(a.participantId));
  const people = state.people.filter((x) => displacedIds.has(x.participantId));
  const run = accommodationRun(state, { pinned, people, rooms, budgetMode: 'respect' });
  const newPlaced = run.allocations.filter((a) => a.status !== 'unplaced');
  const newUnplaced = run.allocations.filter((a) => a.status === 'unplaced');
  const oldCost = displaced.reduce((s, a) => s + (a.cost || 0), 0);
  const newCost = newPlaced.reduce((s, a) => s + (a.cost || 0), 0);
  const pinnedCost = pinned.reduce((s, a) => s + (a.cost || 0), 0);
  const totalAfter = pinnedCost + newCost + run.kept.reduce((s, a) => s + (a.cost || 0), 0) * 0;
  const budget = state.assumptions.externalBudgetINR;
  const overBudget = totalAfter > budget;
  const relaxed = newPlaced.filter((a) => (a.reasonCodes || []).includes('EXTERNAL_COST')).length;
  return {
    risk: overBudget ? 'high' : 'medium',
    summary: {
      roomsClosed: [...roomIds], window: { from: fmtIST(from), to: fmtIST(to) }, displaced: displaced.length,
      rehoused: newPlaced.length, unplaced: newUnplaced.length, externalPlacements: relaxed,
      costDeltaINR: newCost - oldCost, externalCostAfterINR: totalAfter, budgetINR: budget, overBudget,
      unplacedReasons: newUnplaced.reduce((m, a) => { a.reasonCodes.forEach((c) => { m[c] = (m[c] || 0) + 1; }); return m; }, {}),
      displacedSample: displaced.slice(0, 5).map((a) => ({ participantId: a.participantId, from: a.bed.roomId, contingentId: a.contingentId })),
    },
    changes: { type: 'hostel_closure', closure, roomIds: [...roomIds], displacedIds: [...displacedIds], newAllocations: run.allocations, planId: plan.planId },
  };
}

async function applyHostelClosure(session, c, user) {
  await M.Room.updateMany({ roomId: { $in: c.roomIds } }, { $push: { closures: c.closure } }, { session });
  await M.Allocation.updateMany({ planId: c.planId, participantId: { $in: c.displacedIds }, status: { $ne: 'released' } },
    { status: 'released', overrideReason: 'Released by hostel closure' }, { session });
  await M.Allocation.insertMany(c.newAllocations.map((a) => ({ ...a, planId: c.planId, status: a.status === 'unplaced' ? 'unplaced' : 'proposed', overrideReason: null })), { session });
  return { summary: { roomIds: c.roomIds, displaced: c.displacedIds.length } };
}

// ---------- 2. Late contingent (bus delayed)
async function previewLateContingent(state, p) {
  const cid = p.contingentId;
  const newArrival = parseIST(p.newArrival);
  if (!newArrival) throw badRequest('newArrival must be "YYYY-MM-DD HH:mm" IST');
  const members = state.people.filter((x) => x.contingentId === cid && x.personType === 'participant' && !x.quarantined);
  if (!members.length) throw notFound(`No participants in ${cid}`);
  const shift = (x) => ({ ...x, arrival: arrivalAfterDelay(x.arrival, newArrival) });
  const moved = members.map(shift);
  const movedIds = new Set(moved.map((m) => m.participantId));
  const { plan, allocs } = await currentAccommodation();
  const pinned = placedOnly(allocs).filter((a) => !movedIds.has(a.participantId));
  const affectedAllocs = allocs.filter((a) => movedIds.has(a.participantId));
  const run = accommodationRun(state, { pinned, people: moved.filter((m) => m.accommodationRequested), budgetMode: 'respect' });
  const people = state.people.map((x) => (movedIds.has(x.participantId) ? shift(x) : x));
  const ready = state.assumptions.arrivalReadyMinutes ?? 60;
  const sched = scheduleRun(state, { participants: people });
  const current = await activePlan('schedule');
  const slots = current ? await M.Slot.find({ planId: current.planId, participantIds: { $in: [...movedIds] } }).lean() : [];
  const lateSlots = slots.filter((s) => new Date(s.start) < addMinutes(newArrival, ready));
  return {
    risk: 'medium',
    summary: {
      contingentId: cid, members: members.length, newArrival: fmtIST(newArrival),
      bedsReleased: affectedAllocs.filter((a) => a.bed?.kind).length,
      rehoused: run.allocations.filter((a) => a.status !== 'unplaced').length,
      unplaced: run.allocations.filter((a) => a.status === 'unplaced').length,
      slotsAffected: lateSlots.length,
      slotsAffectedSample: lateSlots.slice(0, 6).map((s) => ({ slotId: s.slotId, start: fmtIST(s.start) })),
      scheduleAfter: sched.summary,
    },
    changes: { type: 'late_contingent', contingentId: cid, newArrival, memberArrivals: moved.map(({ participantId, arrival }) => ({ participantId, arrival })), releasedAllocIds: affectedAllocs.map((a) => a._id), newAllocations: run.allocations, planId: plan.planId },
  };
}

async function applyLateContingent(session, c) {
  for (const member of c.memberArrivals) {
    await M.Participant.updateOne({ participantId: member.participantId }, { arrival: member.arrival }, { session });
  }
  await M.Allocation.updateMany({ _id: { $in: c.releasedAllocIds } }, { status: 'released', overrideReason: 'Released: arrival changed' }, { session });
  await M.Allocation.insertMany(c.newAllocations.map((a) => ({ ...a, planId: c.planId, overrideReason: null })), { session });
  return { summary: { contingentId: c.contingentId, members: c.memberArrivals.length } };
}

// ---------- 3. Duplicate record (merge, keep audit)
async function previewDuplicateRecord(state, p) {
  const keep = state.people.find((x) => x.participantId === p.keepId);
  const drop = state.people.find((x) => x.participantId === p.dropId);
  if (!keep || !drop) throw notFound('Both participant IDs must exist');
  if (keep.participantId === drop.participantId) throw badRequest('Choose two different records');
  const regs = state.registrations.filter((r) => r.participantId === drop.participantId);
  const overlapRegs = regs.filter((r) => state.registrations.some((k) => k.participantId === keep.participantId && k.eventId === r.eventId));
  const merch = await M.MerchIssue.find({ participantId: drop.participantId, kind: 'original' }).lean();
  const { plan, allocs } = await currentAccommodation();
  const dropAlloc = allocs.find((a) => a.participantId === drop.participantId && a.status !== 'unplaced' && a.bed?.kind);
  return {
    risk: merch.length ? 'high' : 'medium',
    summary: {
      keep: { participantId: keep.participantId, name: keep.name, contingentId: keep.contingentId },
      drop: { participantId: drop.participantId, name: drop.name, contingentId: drop.contingentId },
      registrationsMoved: regs.length - overlapRegs.length, registrationsDeduped: overlapRegs.length,
      bedReleased: Boolean(dropAlloc), merchAlreadyIssuedToDrop: merch.map((m) => ({ item: m.item, desk: m.desk, issuedAt: m.issuedAt })),
      warning: merch.length ? 'The dropped record already received merch. Reconcile before merging; history is kept.' : null,
    },
    changes: { type: 'duplicate_record', keepId: keep.participantId, dropId: drop.participantId, planId: plan.planId, dropAllocId: dropAlloc?._id || null },
  };
}

async function applyDuplicateRecord(session, c) {
  await M.Participant.updateOne({ participantId: c.dropId }, { active: false, mergedInto: c.keepId, checkInStatus: 'absent' }, { session });
  const dropRegs = await M.Registration.find({ participantId: c.dropId }).session(session).lean();
  for (const r of dropRegs) {
    const exists = await M.Registration.exists({ participantId: c.keepId, eventId: r.eventId }).session(session);
    if (exists) await M.Registration.deleteOne({ _id: r._id }).session(session);
    else await M.Registration.updateOne({ _id: r._id }, { participantId: c.keepId }, { session });
  }
  if (c.dropAllocId) await M.Allocation.updateOne({ _id: c.dropAllocId }, { status: 'released', overrideReason: `Merged into ${c.keepId}` }, { session });
  await M.DuplicateCandidate.updateMany({ $or: [{ a: c.dropId, b: c.keepId }, { a: c.keepId, b: c.dropId }] }, { status: 'merged', 'resolution.keepId': c.keepId }, { session });
  return { summary: { keepId: c.keepId, dropId: c.dropId } };
}

// ---------- 4. Equipment failure
async function previewEquipmentFailure(state, p) {
  const qty = Number(p.qty || 1);
  const stock = state.stock.map((s) => ({ ...s }));
  const avail = stock.find((s) => s.item === p.item && s.state === 'available' && (!p.location || s.location === p.location));
  if (!avail || avail.qty < qty) throw badRequest(`Not enough usable ${p.item} to break ${qty}`);
  const before = scheduleRun(state).summary;
  avail.qty -= qty;
  const damaged = stock.find((s) => s.item === p.item && s.location === avail.location && s.state === 'damaged');
  const after = scheduleRun(state, { stock: stock.concat(damaged ? [] : [{ item: p.item, location: avail.location, state: 'damaged', qty }]) }).summary;
  return {
    risk: 'medium',
    summary: { item: p.item, location: avail.location, qtyBroken: qty, equipmentShortBefore: before.equipmentShortfall, equipmentShortAfter: after.equipmentShortfall, slotsAfter: after.slots },
    changes: { type: 'equipment_failure', item: p.item, location: avail.location, qty },
  };
}

async function applyEquipmentFailure(session, c, user) {
  const bal = await M.StockBalance.findOne({ item: c.item, location: c.location, state: 'available' }).session(session);
  bal.qty -= c.qty; await bal.save({ session });
  await M.StockBalance.updateOne({ item: c.item, location: c.location, state: 'damaged' }, { $inc: { qty: c.qty } }, { upsert: true, session });
  await M.StockMovement.create([{ item: c.item, qty: c.qty, from: { location: c.location, state: 'available' }, to: { location: c.location, state: 'damaged' }, by: user.email, reason: 'Equipment failure reported' }], { session });
  return { summary: { item: c.item, qty: c.qty } };
}

// ---------- 5. Venue change (rain, closure)
async function previewVenueChange(state, p) {
  const from = p.from ? parseIST(p.from) : parseIST(state.assumptions.festWindow.start);
  const to = p.to ? parseIST(p.to) : parseIST(state.assumptions.festWindow.end);
  const v = state.venues.find((x) => x.venueId === p.venueId);
  if (!v) throw notFound(`No venue ${p.venueId}`);
  const venues = withClosure(state.venues, (x) => x.venueId === p.venueId, { start: from, end: to, reason: 'Venue change', disruptionId: 'pending' });
  const before = scheduleRun(state).summary;
  const after = scheduleRun(state, { venues }).summary;
  const current = await activePlan('schedule');
  const affected = current ? await M.Slot.find({ planId: current.planId, venueId: p.venueId, start: { $gte: from, $lt: to } }).lean() : [];
  return {
    risk: 'medium',
    summary: { venue: v.name, window: { from: fmtIST(from), to: fmtIST(to) }, slotsInVenueWindow: affected.length, before, after,
      newUnscheduledRounds: after.unscheduledRounds - before.unscheduledRounds },
    changes: { type: 'venue_change', venueId: p.venueId, from, to },
  };
}

async function applyVenueChange(session, c) {
  await M.Venue.updateOne({ venueId: c.venueId }, { $push: { closures: { start: c.from, end: c.to, reason: 'Venue change' } } }, { session });
  return { summary: { venueId: c.venueId } };
}

// ---------- 6. Vendor shutdown
async function previewVendorShutdown(state, p) {
  const v = state.vendors.find((x) => x.vendorId === p.vendorId);
  if (!v) throw notFound(`No vendor ${p.vendorId}`);
  const from = p.from ? parseIST(p.from) : parseIST(state.assumptions.festWindow.start);
  const to = p.to ? parseIST(p.to) : parseIST(state.assumptions.festWindow.end);
  const incident = { vendorId: v.vendorId, start: from, end: to, reason: 'Shutdown' };
  const before = foodRun(state);
  const after = foodRun(state, { incidents: [...state.incidents, incident] });
  // A cell "worsens" when its gap changes for the worse (e.g. CAPACITY_SHORT -> NO_VENDOR), not only when it flips to uncovered.
  const rank = { null: 0, CAPACITY_SHORT: 1, NO_VENDOR: 2 };
  const worse = after.rows.filter((r) => {
    const b = before.rows.find((x) => x.day === r.day && x.meal === r.meal && x.diet === r.diet);
    return rank[r.gap] > rank[b?.gap ?? null];
  });
  const servingLostHeadcount = worse.reduce((s, r) => s + r.headcount, 0);
  return {
    risk: 'medium',
    summary: { vendor: v.name, menu: v.menu, window: { from: fmtIST(from), to: fmtIST(to) }, before: before.summary, after: after.summary,
      worsenedCells: worse.length, peopleLosingCoverage: servingLostHeadcount,
      worsened: worse.slice(0, 12).map((g) => ({ day: g.day, meal: g.meal, diet: g.diet, headcount: g.headcount, gap: g.gap })),
      onlySourceOf: v.dietaryTags.filter((t) => state.vendors.filter((x) => x.dietaryTags.includes(t)).length === 1) },
    changes: { type: 'vendor_shutdown', incident },
  };
}

async function applyVendorShutdown(session, c) {
  await M.VendorIncident.create([{ ...c.incident }], { session });
  return { summary: { vendorId: c.incident.vendorId } };
}

// ---------- 7. Duplicate merch claim
async function previewDuplicateMerch(state, p) {
  const existing = await M.MerchIssue.findOne({ participantId: p.participantId, item: p.item, kind: 'original' }).lean();
  if (!existing) return { risk: 'low', summary: { allowed: true, note: 'No prior issue; a normal issue would succeed.' }, changes: { type: 'duplicate_merch_claim', participantId: p.participantId, item: p.item, blocked: false } };
  return {
    risk: 'medium',
    summary: { allowed: false, original: { issuedAt: fmtIST(existing.issuedAt), desk: existing.desk, issuedBy: existing.issuedBy, size: existing.size },
      rule: 'One original issue per person per item, enforced by a unique index.' },
    changes: { type: 'duplicate_merch_claim', participantId: p.participantId, item: p.item, blocked: true },
  };
}

// ---------- 8. Constraint change (curfew, distance, toggles)
async function previewConstraintChange(state, p) {
  const before = accommodationRun(state, { budgetMode: 'respect' }).metrics;
  const settings = { ...state.settings, [p.constraintId]: { enabled: p.enabled, params: p.params || {} } };
  const after = accommodationRun({ ...state, settings }, { budgetMode: 'respect' }).metrics;
  return {
    risk: 'medium',
    summary: { constraintId: p.constraintId, enabled: p.enabled, before: pick(before), after: pick(after), deltaUnplaced: after.unplaced - before.unplaced },
    changes: { type: 'constraint_change', constraintId: p.constraintId, enabled: p.enabled, params: p.params || {} },
  };
}
const pick = (m) => ({ placed: m.placed, unplaced: m.unplaced, externalCostINR: m.externalCostINR, splits: m.splits, unplacedByReason: m.unplacedByReason });

async function applyConstraintChange(session, c, user) {
  await M.ConstraintSetting.updateOne({ constraintId: c.constraintId }, { enabled: c.enabled, params: c.params, updatedBy: user.email }, { upsert: true, session });
  return { summary: { constraintId: c.constraintId, enabled: c.enabled } };
}

// ---------- registry
const TYPES = {
  hostel_closure: { preview: previewHostelClosure, apply: applyHostelClosure, risk: 'medium' },
  late_contingent: { preview: previewLateContingent, apply: applyLateContingent, risk: 'medium' },
  duplicate_record: { preview: previewDuplicateRecord, apply: applyDuplicateRecord, risk: 'medium' },
  equipment_failure: { preview: previewEquipmentFailure, apply: applyEquipmentFailure, risk: 'medium' },
  venue_change: { preview: previewVenueChange, apply: applyVenueChange, risk: 'medium' },
  vendor_shutdown: { preview: previewVendorShutdown, apply: applyVendorShutdown, risk: 'medium' },
  duplicate_merch_claim: { preview: previewDuplicateMerch, apply: null, risk: 'medium' },
  constraint_change: { preview: previewConstraintChange, apply: applyConstraintChange, risk: 'medium' },
};

export const DISRUPTION_TYPES = Object.keys(TYPES);

export async function previewDisruption(type, params, user) {
  const t = TYPES[type];
  if (!t) throw badRequest(`Unknown disruption "${type}"`, { allowed: DISRUPTION_TYPES });
  validateDisruptionParams(type, params || {});
  const state = await loadState();
  const out = await t.preview(state, params || {}, user);
  const disruptionId = `D-${Date.now().toString(36).toUpperCase()}`;
  const doc = await M.Disruption.create({
    disruptionId, type, params, status: 'previewed', preview: out.summary, requiresRisk: out.risk,
    createdBy: { userId: user.userId, role: user.role }, result: { changes: out.changes },
  });
  return { disruptionId: doc.disruptionId, type, risk: out.risk, summary: out.summary, committers: DISRUPTION_COMMITTERS[type] || [], explanation: templateExplanation(out.summary?.reasonCodes || []) };
}

export async function commitDisruption(disruptionId, user, reason) {
  assertDisruptionTransactionsSupported(supportsTransactions());
  const d = await M.Disruption.findOne({ disruptionId });
  if (!d) throw notFound('No such disruption');
  if (d.status !== 'previewed') throw badRequest(`Disruption is already ${d.status}`);
  const t = TYPES[d.type];
  validateDisruptionParams(d.type, d.params || {});
  const allowedRoles = DISRUPTION_COMMITTERS[d.type] || [];
  if (user.role !== 'festival_director' && !allowedRoles.includes(user.role)) {
    const { forbidden } = await import('../utils/errors.js');
    throw forbidden(`Only ${allowedRoles.join(', ') || 'the Festival Director'} may commit ${d.type}`);
  }
  const state = await loadState();
  const fresh = await t.preview(state, d.params || {}, user);
  if (d.type === 'duplicate_merch_claim') {
    return runCommand({ user, action: 'MERCH_DUP_REJECTED', entity: { type: 'Participant', id: d.params.participantId }, reason, risk: 'medium', disruptionId }, async () => {
      d.status = 'committed'; d.committedBy = { userId: user.userId, role: user.role }; d.reason = reason; d.committedAt = new Date(); await d.save();
      return { summary: { rejected: true }, result: { blocked: fresh.summary.allowed === false, original: fresh.summary.original || null } };
    });
  }
  const risk = fresh.risk;
  const result = await runCommand({ user, action: `DISRUPTION_${d.type.toUpperCase()}`, entity: { type: 'Disruption', id: disruptionId }, reason, risk, disruptionId, event: `disruption.${d.type}` },
    async (session) => {
      const out = await t.apply(session, fresh.changes, user);
      d.status = 'committed'; d.committedBy = { userId: user.userId, role: user.role }; d.reason = reason; d.committedAt = new Date();
      d.result = { ...out, summary: fresh.summary };
      await d.save({ session });
      return { summary: out.summary, result: { committed: true, summary: fresh.summary } };
    });
  // Schedule-affecting changes re-plan the schedule and activate the new plan, so consequences are visible.
  if (['venue_change', 'equipment_failure'].includes(d.type)) {
    const sp = await buildSchedulePlan({ user });
    const { activateSchedulePlan } = await import('./plans.js');
    await activateSchedulePlan({ user, planId: sp.planId, reason: `Re-planned after ${d.type}` });
    result.replannedSchedule = sp.planId;
  }
  return result;
}
