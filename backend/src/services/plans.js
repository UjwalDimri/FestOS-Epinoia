import * as M from '../models/index.js';
import { runCommand } from './command.js';
import { loadState, accommodationRun, scheduleRun, activePlan } from './state.js';

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
    await M.Plan.updateMany({ type: plan.type, status: 'active' }, { status: 'superseded' }, { session });
    plan.status = 'active'; plan.activatedBy = user.email; plan.activatedAt = new Date(); plan.reason = reason || plan.reason;
    await plan.save({ session });
    return { summary: { planId, type: plan.type }, result: { activated: planId } };
  });
}

export async function buildSchedulePlan({ user, planId, state: currentState, session } = {}) {
  const state = currentState || await loadState();
  const run = scheduleRun(state);
  const id = planId || `SCH-${Date.now().toString(36).toUpperCase()}`;
  const plan = new M.Plan({ planId: id, type: 'schedule', strategy: 'greedy-arrival-heats', status: 'draft', metrics: run.summary, createdBy: user.email });
  await plan.save(session ? { session } : undefined);
  const slots = [...run.slots, ...run.unscheduled.map((u) => ({ ...u, status: 'unscheduled' }))].map((s) => ({ ...s, planId: id }));
  if (slots.length) await M.Slot.insertMany(slots, session ? { session } : undefined);
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
