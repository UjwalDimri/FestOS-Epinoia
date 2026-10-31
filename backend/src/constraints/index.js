import './accommodation.js';
import './schedule.js';
import './vendor.js';
import { ConstraintSetting } from '../models/index.js';

export * from './registry.js';

export async function loadConstraintSettings(session) {
  const query = ConstraintSetting.find({});
  if (session) query.session(session);
  const docs = await query.lean();
  return Object.fromEntries(docs.map((d) => [d.constraintId, { enabled: d.enabled, params: d.params }]));
}
