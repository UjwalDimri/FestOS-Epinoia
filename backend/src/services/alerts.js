// Control-tower alert rules. Each rule reads state and returns alerts; alerts are upserted by key and escalate
// to the Festival Director if nobody acknowledges them within escalationMinutes.
import * as M from '../models/index.js';
import { loadState, accommodationRun, scheduleRun, foodRun, activePlan } from './state.js';
import { istDateKey, addMinutes } from '../utils/time.js';

const hours = (ms) => ms / 3600000;

export async function computeAlerts(now = new Date()) {
  const state = await loadState();
  const out = [];
  const add = (a) => out.push(a);

  // Accommodation (active plan)
  const plan = await activePlan('accommodation');
  if (plan) {
    const allocs = await M.Allocation.find({ planId: plan.planId, status: { $ne: 'released' } }).lean();
    const unplaced = allocs.filter((a) => a.status === 'unplaced');
    const minorNoEscort = unplaced.filter((a) => a.reasonCodes.includes('MINOR_NO_ESCORT'));
    const accessUnplaced = unplaced.filter((a) => a.reasonCodes.some((c) => ['ACCESS_UNVERIFIED', 'NO_ACCESSIBLE_BED'].includes(c)));
    if (accessUnplaced.length) add({ key: 'ACC_ACCESS_UNPLACED', ruleId: 'ACC_ACCESS_UNPLACED', severity: 'high', ownerRole: 'hospitality',
      title: `${accessUnplaced.length} people with access needs have no bed`, detail: 'Only 10 accessible hostel rooms exist. External properties are unverified, so they are excluded by the hard rule.',
      affectedCount: accessUnplaced.length, entityRefs: accessUnplaced.slice(0, 20).map((a) => a.participantId), suggestedAction: 'Verify accessibility at an external property, or use the Hospitality override with a reason.' });
    if (minorNoEscort.length) add({ key: 'ACC_MINOR_NO_ESCORT', ruleId: 'ACC_MINOR_NO_ESCORT', severity: 'critical', ownerRole: 'hospitality',
      title: `${minorNoEscort.length} minors have no escort-covered bed`, affectedCount: minorNoEscort.length, entityRefs: minorNoEscort.map((a) => a.participantId),
      suggestedAction: 'Place on the escort site or reassign the escort. Director sign-off required.' });
    const perNight = (() => {
      const r = plan.metrics?.perNight || [];
      return r.filter((n) => n.shortfall > 0);
    })();
    if (perNight.length) add({ key: 'ACC_NIGHT_SHORTFALL', ruleId: 'ACC_NIGHT_SHORTFALL', severity: 'high', ownerRole: 'festival_director',
      title: `Bed shortfall on ${perNight.map((n) => n.night).join(', ')}`, detail: perNight.map((n) => `${n.night}: ${n.demand} need, ${n.capacity} beds, short ${n.shortfall}`).join(' · '),
      affectedCount: perNight.reduce((s, n) => s + n.shortfall, 0), suggestedAction: 'Verify more external beds or confirm early departures. Shortfall is an honest capacity gap, not a bug.' });
    if (plan.metrics?.overBudget) add({ key: 'ACC_OVER_BUDGET', ruleId: 'ACC_OVER_BUDGET', severity: 'high', ownerRole: 'festival_director',
      title: 'External accommodation is over budget', affectedCount: plan.metrics.externalCostINR, suggestedAction: 'Director override with a reason, or raise the budget assumption.' });
  }

  // Schedule (active plan)
  const sp = await activePlan('schedule');
  if (sp) {
    const m = sp.metrics || {};
    if (m.participantClashes) add({ key: 'SCH_CLASH', ruleId: 'SCH_CLASH', severity: 'medium', ownerRole: 'events_team',
      title: `${m.participantClashes} participant clashes in the schedule`, affectedCount: m.participantClashes, suggestedAction: 'Move a clashing participant to another heat of the same event.' });
    if (m.notPresent) add({ key: 'SCH_NOT_PRESENT', ruleId: 'SCH_NOT_PRESENT', severity: 'medium', ownerRole: 'events_team',
      title: `${m.notPresent} participant-slots before arrival`, affectedCount: m.notPresent, suggestedAction: 'Re-run heat assignment after late-arrival changes.' });
    if (m.equipmentShortfall) add({ key: 'SCH_EQUIPMENT', ruleId: 'SCH_EQUIPMENT', severity: 'medium', ownerRole: 'logistics_head',
      title: `Equipment short for ${m.equipmentShortfall} unit-slots`, affectedCount: m.equipmentShortfall, suggestedAction: 'Move stock from another location or swap the venue.' });
    if (m.unscheduledRounds) add({ key: 'SCH_UNSCHEDULED', ruleId: 'SCH_UNSCHEDULED', severity: 'low', ownerRole: 'events_team',
      title: `${m.unscheduledRounds} later rounds wait for results`, affectedCount: m.unscheduledRounds, suggestedAction: 'Scheduled once prelim results are in.' });
  }

  // Vendors
  for (const v of state.vendors) {
    const exp = v.certExpiry ? new Date(v.certExpiry) : null;
    const override = v.complianceOverride?.until && new Date(v.complianceOverride.until) > now;
    if (!exp) add({ key: `VND_CERT_MISSING_${v.vendorId}`, ruleId: 'VND_CERT_MISSING', severity: 'high', ownerRole: 'food_coordinator',
      title: `${v.name}: hygiene certificate is missing`, detail: `${v.menu}. This vendor is excluded from meal coverage until a valid certificate is recorded.`, entityRefs: [v.vendorId], suggestedAction: 'Verify and record the vendor hygiene certificate.' });
    else if (exp < now && !override) add({ key: `VND_CERT_EXPIRED_${v.vendorId}`, ruleId: 'VND_CERT_EXPIRED', severity: 'high', ownerRole: 'food_coordinator',
      title: `${v.name}: hygiene certificate expired`, detail: `${v.menu}. Blocked until a current certificate is recorded.`, entityRefs: [v.vendorId], suggestedAction: 'Pull from the coverage matrix or get a renewed certificate.' });
    else if (exp && exp - now < 24 * 3600000 && exp >= now) add({ key: `VND_CERT_SOON_${v.vendorId}`, ruleId: 'VND_CERT_SOON', severity: 'medium', ownerRole: 'food_coordinator',
      title: `${v.name}: certificate expires within 24h`, entityRefs: [v.vendorId], suggestedAction: 'Confirm renewal before the next meal.' });
  }
  const food = foodRun(state);
  const dinnerGroups = [...new Set(food.rows.filter((r) => !r.covered).map((r) => `${r.day} ${r.meal} ${r.diet}`))];
  if (dinnerGroups.length) add({ key: 'FOOD_UNCOVERED', ruleId: 'FOOD_UNCOVERED', severity: food.summary.noVendorGroups.length ? 'high' : 'medium', ownerRole: 'food_coordinator',
    title: `${dinnerGroups.length} meal slots with no covering vendor`, detail: food.summary.noVendorGroups.length ? `No vendor for: ${food.summary.noVendorGroups.join(', ')}` : 'Capacity short for some groups.',
    affectedCount: food.summary.uncoveredHeadcount, suggestedAction: 'Arrange a backup vendor or a nut-free kitchen.' });

  // Data quality
  const highIssues = await M.DataIssue.countDocuments({ severity: 'high', status: 'open' });
  if (highIssues) add({ key: 'DATA_HIGH_OPEN', ruleId: 'DATA_HIGH_OPEN', severity: 'high', ownerRole: 'registration_desk',
    title: `${highIssues} high-severity data issues are open`, affectedCount: highIssues, suggestedAction: 'Open Data Quality and resolve or accept each one.' });
  const dupes = await M.DuplicateCandidate.countDocuments({ status: 'open' });
  if (dupes) add({ key: 'DATA_DUPLICATES', ruleId: 'DATA_DUPLICATES', severity: 'medium', ownerRole: 'registration_desk',
    title: `${dupes} possible duplicate records await a human decision`, affectedCount: dupes, suggestedAction: 'Review merge candidates side by side.' });

  // Merch
  const merch = await M.MerchStock.find({}).lean();
  for (const s of merch) {
    const left = s.quantity - s.reserved - (s.issued || 0);
    if (left <= 0 && s.quantity > 0) add({ key: `MERCH_OUT_${s.item}_${s.size}`.replace(/\s+/g, '_'), ruleId: 'MERCH_OUT', severity: 'medium', ownerRole: 'merchandise_desk',
      title: `${s.item} size ${s.size} is out`, suggestedAction: 'Substitute a size and log it, or reorder.' });
  }

  // Staffing gaps from import
  const gaps = await M.DataIssue.find({ code: 'STAFF_COVERAGE_GAP' }).lean();
  for (const g of gaps) add({ key: `STAFF_${g.entity.id}`, ruleId: 'STAFF_GAP', severity: 'medium', ownerRole: 'festival_director', title: g.message, suggestedAction: 'Assign cover for the gap.' });

  // Upsert and escalate
  const keys = new Set(out.map((a) => a.key));
  const escalateMin = state.assumptions.escalationMinutes ?? 15;
  for (const a of out) {
    const existing = await M.Alert.findOne({ key: a.key }).lean();
    const firstSeen = existing?.firstSeenAt || now;
    const acked = existing?.status === 'acknowledged';
    const ageMin = (now - new Date(firstSeen)) / 60000;
    await M.Alert.updateOne({ key: a.key }, {
      $set: { ...a, lastSeenAt: now, status: acked ? 'acknowledged' : 'open', escalated: !acked && ageMin >= escalateMin },
      $setOnInsert: { firstSeenAt: firstSeen },
    }, { upsert: true });
  }
  await M.Alert.updateMany({ key: { $nin: [...keys] }, status: { $ne: 'resolved' } }, { status: 'resolved', resolvedAt: now });
  return M.Alert.find({ status: { $ne: 'resolved' } }).sort({ severity: 1 }).lean();
}
