// Accommodation allocator: a pure function. State in -> allocations + reason codes + metrics out.
// Allocates bed-NIGHTS: a bed can host someone leaving 31 Oct and someone arriving 1 Nov (after the cleaning buffer).
import { activeFor } from '../constraints/registry.js';
import { istDateKey, atIST, dateRangeKeys, overlaps } from '../utils/time.js';

const HOUR = 3600000;

export function nightKeys(checkIn, checkOut) {
  if (!checkIn || !checkOut || new Date(checkOut) <= new Date(checkIn)) return [];
  const start = new Date(new Date(checkIn).getTime() - 86400000);
  return dateRangeKeys(istDateKey(start), istDateKey(checkOut))
    .filter((k) => { const t = atIST(k, '23:00'); return new Date(checkIn) <= t && t < new Date(checkOut); });
}

export function buildLocations(rooms, properties, assumptions) {
  const radius = assumptions.campusRadiusKm ?? 1;
  const locs = [];
  for (const r of rooms) {
    locs.push({
      key: r.roomId, kind: 'hostel', roomId: r.roomId, pool: r.pool, accessible: r.accessible, floor: r.floor, capacity: r.capacity,
      site: 'campus', group: r.block, costPerNight: 0, distanceKm: 0, transport: 'yes', status: r.status, closures: r.closures || [],
      beds: Array.from({ length: r.capacity }, (_, i) => ({ bedNo: i + 1, intervals: [] })),
    });
  }
  for (const p of properties) {
    locs.push({
      key: p.propertyId, kind: 'external', propertyId: p.propertyId, name: p.name, pool: 'any', accessible: p.accessible, floor: null,
      capacity: p.beds, site: (p.distanceKm ?? 99) <= radius ? 'campus' : p.propertyId, group: p.propertyId,
      costPerNight: p.costPerBedPerNight, distanceKm: p.distanceKm, transport: p.transport, status: p.status, closures: p.closures || [],
      beds: Array.from({ length: p.beds }, (_, i) => ({ bedNo: i + 1, intervals: [] })),
    });
  }
  return locs;
}

function freeBed(loc, checkIn, checkOut, bufferMs) {
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime() + bufferMs;
  for (const bed of loc.beds) {
    if (bed.intervals.every((iv) => !(a < iv.outBuf && iv.in < b))) return bed;
  }
  return null;
}

function occupy(bed, checkIn, checkOut, bufferMs) {
  bed.intervals.push({ in: new Date(checkIn).getTime(), outBuf: new Date(checkOut).getTime() + bufferMs });
}

const addTo = (map, key, val) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(val); };

export function eligibleDemand(p) {
  return p.active && !p.quarantined && p.accommodationRequested === true && p.arrival && p.departure && new Date(p.departure) > new Date(p.arrival);
}

function personDemand(p) {
  return {
    participantId: p.participantId, contingentId: p.contingentId, personType: p.personType, isLeader: !!p.isLeader,
    housingCategory: p.housingCategory, accessibility: p.accessibility, isMinor: !!p.isMinor,
    checkIn: new Date(p.arrival), checkOut: new Date(p.departure),
  };
}

const UNPLACED_PRIORITY = ['ACCESS_UNVERIFIED', 'NO_ACCESSIBLE_BED', 'MINOR_NO_ESCORT', 'GENDER_UNCONFIRMED', 'OUTSIDE_RADIUS', 'NO_SUITABLE_POOL', 'ROOM_CLOSED'];

/**
 * allocate({ people, rooms, properties, contingents, assumptions, settings, strategy, budgetMode, pinned })
 * - people: participant docs to place (others may be pinned)
 * - pinned: existing placed allocations to keep untouched (minimal re-plan)
 */
export function allocate({ people, rooms, properties, contingents, assumptions, settings = {}, strategy = 'balanced', budgetMode = 'respect', pinned = [] }) {
  const weightsBase = assumptions.strategyWeights?.[strategy] || assumptions.strategyWeights?.balanced;
  const bufferMs = (assumptions.cleaningBufferHours ?? 3) * HOUR;
  const budget = assumptions.externalBudgetINR ?? Infinity;
  const locations = buildLocations(rooms, properties, assumptions);
  const locByKey = new Map(locations.map((l) => [l.key, l]));
  const hard = activeFor('accommodation', settings).filter((c) => c.kind === 'hard');
  const soft = activeFor('accommodation', settings).filter((c) => c.kind === 'soft');
  const contingentPrefs = new Map(contingents.map((c) => [c.contingentId, c.preferences || []]));

  const ctx = {
    assumptions, escortSites: new Map(), contingentSites: new Map(), contingentGroups: new Map(), contingentFloors: new Map(), contingentPrefs,
  };
  let spent = 0;

  const record = (alloc, loc) => {
    if (alloc.personType === 'escort') addTo(ctx.escortSites, alloc.contingentId, loc.site);
    else {
      addTo(ctx.contingentSites, alloc.contingentId, loc.site);
      addTo(ctx.contingentGroups, alloc.contingentId, loc.group);
      if (loc.kind === 'hostel') addTo(ctx.contingentFloors, alloc.contingentId, `${loc.group}-${loc.floor}`);
    }
  };

  // Pinned allocations occupy their beds first.
  const kept = [];
  for (const a of pinned) {
    if (a.status === 'unplaced' || !a.bed?.kind) continue;
    const loc = locByKey.get(a.bed.kind === 'hostel' ? a.bed.roomId : a.bed.propertyId);
    if (!loc) continue;
    const bed = loc.beds.find((b) => b.bedNo === a.bed.bedNo) || loc.beds[0];
    occupy(bed, a.checkIn, a.checkOut, bufferMs);
    record(a, loc);
    spent += a.cost || 0;
    kept.push(a);
  }

  const demand = people.filter(eligibleDemand).map(personDemand);
  const notEligible = people.filter((p) => p.accommodationRequested === true && !eligibleDemand(p));

  const prefRank = (cid) => ((contingentPrefs.get(cid) || []).includes('keep_together') ? 0 : 1);
  const size = new Map();
  for (const d of demand) size.set(d.contingentId, (size.get(d.contingentId) || 0) + 1);
  const phase = (d) => {
    if (d.personType === 'escort') return 0;
    if (d.accessibility?.status === 'declared') return 1;
    if (d.isMinor) return 2;
    return 3;
  };
  demand.sort((x, y) => phase(x) - phase(y)
    || prefRank(x.contingentId) - prefRank(y.contingentId)
    || (size.get(y.contingentId) || 0) - (size.get(x.contingentId) || 0)
    || x.contingentId.localeCompare(y.contingentId)
    || Number(y.isLeader) - Number(x.isLeader)
    || x.participantId.localeCompare(y.participantId));

  const placed = [];
  const unplaced = [];
  for (const d of demand) {
    const prefs = contingentPrefs.get(d.contingentId) || [];
    const w = { ...weightsBase };
    if (prefs.includes('keep_together')) { w.site *= 2; w.group *= 2; }
    if (prefs.includes('low_cost')) w.cost *= 1.5;
    if (prefs.includes('near_venue')) w.distance *= 2;
    const nights = nightKeys(d.checkIn, d.checkOut);

    let best = null;
    const reasons = new Set();
    let sawCapacityOnly = false;
    let sawBudgetOnly = false;
    for (const loc of locations) {
      let ok = true;
      for (const c of hard) {
        if (!c.appliesTo(d, ctx)) continue;
        const r = c.check(d, loc, { ...ctx, params: c.params });
        if (!r.ok) { ok = false; reasons.add(r.reason); break; }
      }
      if (!ok) continue;
      const bed = freeBed(loc, d.checkIn, d.checkOut, bufferMs);
      if (!bed) { sawCapacityOnly = true; continue; }
      const cost = loc.costPerNight * nights.length;
      if (loc.kind === 'external' && budgetMode === 'respect' && spent + cost > budget) { sawBudgetOnly = true; continue; }
      let score = 0;
      for (const c of soft) {
        if (!c.appliesTo(d, ctx)) continue;
        score += (w[c.weightKey] ?? 1) * c.penalty(d, loc, { ...ctx, params: c.params });
      }
      if (d.personType === 'escort' && loc.site !== 'campus') score += 100;
      if (!best || score < best.score - 1e-9 || (Math.abs(score - best.score) < 1e-9 && loc.key < best.loc.key)) best = { score, loc, bed, cost };
    }

    if (!best) {
      let codes;
      if (sawBudgetOnly) codes = ['OVER_BUDGET'];
      else if (sawCapacityOnly) codes = ['NIGHT_SHORTAGE'];
      else codes = UNPLACED_PRIORITY.filter((r) => reasons.has(r)).slice(0, 2);
      if (!codes.length) codes = ['NO_SUITABLE_POOL'];
      unplaced.push({ participantId: d.participantId, contingentId: d.contingentId, personType: d.personType, bed: { kind: null },
        checkIn: d.checkIn, checkOut: d.checkOut, nights: nights.length, costPerNight: 0, cost: 0, status: 'unplaced', reasonCodes: codes, relaxed: [] });
      continue;
    }

    const { loc, bed, cost } = best;
    occupy(bed, d.checkIn, d.checkOut, bufferMs);
    spent += cost;
    const codes = [];
    if (loc.kind === 'hostel') codes.push(d.housingCategory === 'female' ? 'POOL_MATCH_FEMALE' : d.housingCategory === 'male' ? 'POOL_MATCH_MALE' : 'EXTERNAL_ANY_POOL');
    else codes.push(d.housingCategory === 'unconfirmed' && d.personType !== 'escort' ? 'GENDER_UNCONFIRMED_PROVISIONAL' : 'EXTERNAL_ANY_POOL');
    if (d.accessibility?.status === 'declared') codes.push('ACCESSIBLE_BED');
    if (d.isMinor) codes.push('ESCORT_COVERED');
    if (d.personType === 'escort') codes.push('ESCORT_SITE');
    if (d.isLeader) codes.push('LEADER_WITH_GROUP');
    codes.push(loc.kind === 'hostel' ? 'COST_FREE_HOSTEL' : 'EXTERNAL_COST');
    const alloc = {
      participantId: d.participantId, contingentId: d.contingentId, personType: d.personType,
      bed: loc.kind === 'hostel'
        ? { kind: 'hostel', roomId: loc.roomId, bedNo: bed.bedNo, site: loc.site, group: loc.group }
        : { kind: 'external', propertyId: loc.propertyId, bedNo: bed.bedNo, site: loc.site, group: loc.group },
      checkIn: d.checkIn, checkOut: d.checkOut, nights: nights.length, costPerNight: loc.costPerNight, cost,
      status: 'proposed', reasonCodes: codes, relaxed: [],
    };
    record(alloc, loc);
    placed.push(alloc);
  }

  for (const p of notEligible) {
    unplaced.push({ participantId: p.participantId, contingentId: p.contingentId, personType: p.personType, bed: { kind: null },
      checkIn: p.arrival, checkOut: p.departure, nights: 0, costPerNight: 0, cost: 0, status: 'unplaced',
      reasonCodes: ['QUARANTINED'], relaxed: [] });
  }

  const all = [...kept, ...placed];
  annotateCohesion(all);
  const metrics = computeMetrics({ allocations: [...all, ...unplaced], people: [...people], locations, assumptions, strategy, budgetMode, budget });
  return { allocations: [...placed, ...unplaced], kept, metrics };
}

// Members away from their contingent's main site get CONTINGENT_SPLIT; the rest CONTINGENT_TOGETHER.
export function annotateCohesion(placed) {
  const bySite = new Map();
  for (const a of placed) {
    if (a.personType === 'escort' || !a.bed?.site) continue;
    if (!bySite.has(a.contingentId)) bySite.set(a.contingentId, new Map());
    const m = bySite.get(a.contingentId);
    m.set(a.bed.site, (m.get(a.bed.site) || 0) + 1);
  }
  const mainSite = new Map([...bySite].map(([cid, m]) => [cid, [...m].sort((x, y) => y[1] - x[1] || String(x[0]).localeCompare(String(y[0])))[0][0]]));
  for (const a of placed) {
    if (a.personType === 'escort' || !a.bed?.site) continue;
    a.reasonCodes = (a.reasonCodes || []).filter((c) => c !== 'CONTINGENT_SPLIT' && c !== 'CONTINGENT_TOGETHER');
    a.reasonCodes.push(a.bed.site === mainSite.get(a.contingentId) ? 'CONTINGENT_TOGETHER' : 'CONTINGENT_SPLIT');
  }
}

export function computeMetrics({ allocations, people, locations, assumptions, strategy, budgetMode, budget }) {
  const placed = allocations.filter((a) => a.status !== 'unplaced' && a.status !== 'released' && a.bed?.kind);
  const unplaced = allocations.filter((a) => a.status === 'unplaced');
  const byReason = {};
  for (const u of unplaced) for (const c of u.reasonCodes) byReason[c] = (byReason[c] || 0) + 1;
  const externalCost = placed.reduce((s, a) => s + (a.cost || 0), 0);
  const sites = new Map();
  for (const a of placed) {
    if (a.personType === 'escort') continue;
    if (!sites.has(a.contingentId)) sites.set(a.contingentId, new Set());
    sites.get(a.contingentId).add(a.bed.site);
  }
  const splits = [...sites.values()].reduce((s, set) => s + (set.size - 1), 0);
  const contingentsSplit = [...sites.values()].filter((s) => s.size > 1).length;

  const personById = new Map(people.map((p) => [p.participantId, p]));
  const accessibleNeeded = people.filter((p) => eligibleDemand(p) && p.accessibility?.status === 'declared').length;
  const accessiblePlaced = placed.filter((a) => personById.get(a.participantId)?.accessibility?.status === 'declared').length;

  // Per-night demand vs supply
  const nightDemand = new Map();
  for (const p of people.filter(eligibleDemand)) for (const k of nightKeys(p.arrival, p.departure)) nightDemand.set(k, (nightDemand.get(k) || 0) + 1);
  const nightPlaced = new Map();
  for (const a of placed) for (const k of nightKeys(a.checkIn, a.checkOut)) nightPlaced.set(k, (nightPlaced.get(k) || 0) + 1);
  const perNight = [...nightDemand.keys()].sort().map((night) => {
    const t = atIST(night, '23:00');
    const capacity = (locations || []).filter((l) => l.status !== 'closed' && !(l.closures || []).some((c) => overlaps(t, new Date(t.getTime() + 1), c.start, c.end)))
      .reduce((s, l) => s + l.capacity, 0);
    const demand = nightDemand.get(night) || 0;
    return { night, demand, placed: nightPlaced.get(night) || 0, capacity, shortfall: Math.max(0, demand - capacity) };
  });

  return {
    strategy, budgetMode, demand: placed.length + unplaced.length, placed: placed.length, unplaced: unplaced.length, unplacedByReason: byReason,
    externalCostINR: externalCost, budgetINR: budget, overBudget: externalCost > budget, budgetRemainingINR: budget - externalCost,
    splits, contingentsSplit, externalPlaced: placed.filter((a) => a.bed.kind === 'external').length,
    hostelPlaced: placed.filter((a) => a.bed.kind === 'hostel').length, accessibleNeeded, accessiblePlaced, perNight,
  };
}

// Used by manual overrides: which hard constraints would this placement violate?
export function checkPlacement({ person, location, assumptions, settings, escortSites = new Map() }) {
  const d = personDemand(person);
  const ctx = { assumptions, escortSites, contingentSites: new Map(), contingentGroups: new Map(), contingentFloors: new Map(), contingentPrefs: new Map() };
  const violations = [];
  for (const c of activeFor('accommodation', settings).filter((x) => x.kind === 'hard')) {
    if (!c.appliesTo(d, ctx)) continue;
    const r = c.check(d, location, { ...ctx, params: c.params });
    if (!r.ok) violations.push({ constraintId: c.id, reason: r.reason, risk: c.risk, label: c.label });
  }
  return violations;
}
