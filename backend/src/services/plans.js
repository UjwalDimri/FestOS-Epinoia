import * as M from '../models/index.js';
import { runCommand } from './command.js';
import { loadState, accommodationRun, scheduleRun, activePlan } from './state.js';
import { supportsTransactions } from '../config/db.js';
import { badRequest, conflict } from '../utils/errors.js';

// Build a draft accommodation plan from current state, store allocations, return the plan summary.
export async function buildAccommodationPlan({ user, strategy = 'balanced', budgetMode = 'respect', planId }) {
  const state = await loadState();
  const run = accommodationRun(state, { strategy, budgetMode });
  const id = planId || `ACC-${strategy.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  await M.Plan.create({ planId: id, type: 'accommodation', strategy, status: 'draft', metrics: run.metrics, params: { budgetMode }, createdBy: user.email, reason: 'Generated' });
  await M.Allocation.insertMany([...run.allocations, ...run.kept].map((a) => ({ ...a, planId: id })));
  return { planId: id, metrics: run.metrics };
}

export async function activateAccommodationPlan({ user, planId, reason }) {
  return runCommand({ user, action: 'PLAN_ACTIVATE', entity: { type: 'Plan', id: planId }, reason, risk: 'low', event: 'plan.activated' }, async (session) => {
    const plan = await M.Plan.findOne({ planId }).session(session);
    if (!plan) throw new Error('Plan not found');
    if (plan.status !== 'draft') throw conflict('Only a draft accommodation plan can be activated');
    const previousPlan = await M.Plan.findOne({ type: 'accommodation', status: 'active', planId: { $ne: planId } }).session(session).lean();
    const previous = previousPlan ? await M.Allocation.find({ planId: previousPlan.planId, status: { $in: ['proposed', 'reserved', 'confirmed', 'checked_in'] }, 'bed.kind': { $in: ['hostel', 'external'] } }).session(session).lean() : [];
    if (previous.length && (!reason || reason.trim().length < 5)) throw badRequest('Re-activating accommodation requires an explicit reason of at least 5 characters because existing allocations may move.');
    const candidates = await M.Allocation.find({ planId, status: 'proposed', 'bed.kind': { $in: ['hostel', 'external'] } }).session(session).lean();
    const reserved = [];
    try {
      for (const old of previous) {
        const model = old.bed.kind === 'hostel' ? M.Room : M.ExternalProperty;
        const key = old.bed.kind === 'hostel' ? { roomId: old.bed.roomId } : { propertyId: old.bed.propertyId };
        await model.updateOne({ ...key, 'reservations.allocationId': old._id }, { $pull: { reservations: { allocationId: old._id } } }, session ? { session } : {});
      }
      if (previous.length) await M.Allocation.updateMany({ _id: { $in: previous.map((a) => a._id) } }, { status: 'moved' }, session ? { session } : {});
      for (const a of candidates) {
        const hostel = a.bed.kind === 'hostel';
        const model = hostel ? M.Room : M.ExternalProperty;
        const key = hostel ? { roomId: a.bed.roomId } : { propertyId: a.bed.propertyId };
        const bedId = `${a.bed.roomId || a.bed.propertyId}-B${a.bed.bedNo}`;
        const free = { $or: [{ reservations: { $exists: false } }, { reservations: { $not: { $elemMatch: { bedNo: a.bed.bedNo, status: { $in: ['reserved', 'confirmed', 'checked_in'] }, start: { $lt: a.checkOut }, end: { $gt: a.checkIn } } } } }] };
        const readiness = hostel
          ? { status: { $in: ['ready', 'available'] }, capacity: { $gte: a.bed.bedNo }, $and: [{ $or: [{ beds: { $exists: false } }, { beds: { $size: 0 } }, { beds: { $elemMatch: { bedId, status: 'available' } } }] }] }
          : { status: { $in: ['available', 'active'] }, beds: { $gte: a.bed.bedNo } };
        const result = await model.updateOne({ ...key, ...readiness, $and: [...(readiness.$and || []), free] }, { $push: { reservations: { allocationId: a._id, bedNo: a.bed.bedNo, participantId: a.participantId, start: a.checkIn, end: a.checkOut, status: 'confirmed' } }, $inc: { reservationVersion: 1 } }, session ? { session } : {});
        if (!result.modifiedCount) throw conflict(`Bed ${a.bed.bedNo} is no longer available for ${a.participantId}`);
        const prior = previous.find((x) => x.participantId === a.participantId);
        if (prior) await M.Allocation.updateOne({ _id: a._id }, { status: 'confirmed', previousAllocationId: prior._id }, session ? { session } : {});
        reserved.push({ model, key, allocationId: a._id });
      }
    } catch (error) {
      if (!session && !supportsTransactions()) {
        for (const x of reserved) await x.model.updateOne({ ...x.key, 'reservations.allocationId': x.allocationId }, { $pull: { reservations: { allocationId: x.allocationId } } });
        await M.Allocation.updateMany({ planId, status: 'confirmed' }, { $set: { status: 'proposed' }, $unset: { previousAllocationId: 1 } });
        for (const old of previous) { const model=old.bed.kind==='hostel'?M.Room:M.ExternalProperty;const key=old.bed.kind==='hostel'?{roomId:old.bed.roomId}:{propertyId:old.bed.propertyId};await M.Allocation.updateOne({_id:old._id},{status:old.status});await model.updateOne(key,{$push:{reservations:{allocationId:old._id,bedNo:old.bed.bedNo,participantId:old.participantId,start:old.checkIn,end:old.checkOut,status:old.status}}}); }
      }
      throw error;
    }
    await M.Allocation.updateMany({ planId, status: 'proposed', 'bed.kind': { $in: ['hostel', 'external'] } }, { status: 'confirmed' }, { session });
    await M.Plan.updateMany({ type: plan.type, status: 'active' }, { status: 'superseded' }, { session });
    plan.status = 'active'; plan.activatedBy = user.email; plan.activatedAt = new Date(); plan.reason = reason || plan.reason;
    await plan.save({ session });
    return { summary: { planId, type: plan.type }, result: { activated: planId } };
  });
}

export async function buildSchedulePlan({ user, planId }) {
  const state = await loadState();
  const run = scheduleRun(state);
  const id = planId || `SCH-${Date.now().toString(36).toUpperCase()}`;
  await M.Plan.create({ planId: id, type: 'schedule', strategy: 'greedy-arrival-heats', status: 'draft', metrics: run.summary, createdBy: user.email });
  await M.Slot.insertMany([...run.slots, ...run.unscheduled.map((u) => ({ ...u, status: 'unscheduled' }))].map((s) => ({ ...s, planId: id })));
  return { planId: id, metrics: run.summary };
}

export async function latestActive(type) {
  return activePlan(type);
}

export async function activateSchedulePlan({ user, planId, reason }) {
  return runCommand({ user, action: 'PLAN_ACTIVATE', entity: { type: 'Plan', id: planId }, reason, risk: 'low', event: 'plan.activated' }, async (session) => {
    const plan = await M.Plan.findOne({ planId }).session(session);
    if (!plan) throw new Error('Plan not found');
    await M.Plan.updateMany({ type: 'schedule', status: 'active' }, { status: 'superseded' }, { session });
    plan.status = 'active'; plan.activatedBy = user.email; plan.activatedAt = new Date(); plan.reason = reason || plan.reason;
    await plan.save({ session });
    return { summary: { planId, type: 'schedule' }, result: { activated: planId } };
  });
}
