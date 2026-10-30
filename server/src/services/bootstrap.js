import * as M from '../models/index.js';
import { buildAccommodationPlan, buildSchedulePlan } from './plans.js';

// After import, create and activate a starting accommodation and schedule plan so the portal is never empty.
export async function ensureDefaultPlans(user) {
  const hasAcc = await M.Plan.exists({ type: 'accommodation', status: 'active' });
  if (!hasAcc) {
    const r = await buildAccommodationPlan({ user, strategy: 'balanced', planId: 'ACC-BALANCED-v1' });
    await M.Plan.updateOne({ planId: r.planId }, { status: 'active', activatedBy: user.email, activatedAt: new Date(), reason: 'Starting plan' });
  }
  const hasSch = await M.Plan.exists({ type: 'schedule', status: 'active' });
  if (!hasSch) {
    const r = await buildSchedulePlan({ user, planId: 'SCH-v1' });
    await M.Plan.updateOne({ planId: r.planId }, { status: 'active', activatedBy: user.email, activatedAt: new Date(), reason: 'Starting plan' });
  }
}
