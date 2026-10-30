import { register } from './registry.js';
import { overlaps } from '../utils/time.js';

// subject = person demand { housingCategory, accessibility, isMinor, contingentId, checkIn, checkOut, personType }
// candidate = location { kind, pool, accessible, floor, site, group, costPerNight, distanceKm, transport, status, closures }

register({
  id: 'ACC_POOL_MATCH', scope: 'accommodation', kind: 'hard', risk: 'high',
  label: 'Housing pool matches the person (girls/boys blocks only for declared Female/Male; never force anyone outside the binary into them)',
  appliesTo: () => true,
  check: (p, loc) => {
    if (loc.kind === 'external') return { ok: true };
    if (loc.pool === 'all_gender') return { ok: true };
    if (p.housingCategory === 'female') return loc.pool === 'girls' ? { ok: true } : { ok: false, reason: 'NO_SUITABLE_POOL' };
    if (p.housingCategory === 'male') return loc.pool === 'boys' ? { ok: true } : { ok: false, reason: 'NO_SUITABLE_POOL' };
    if (p.housingCategory === 'unconfirmed') return { ok: false, reason: 'GENDER_UNCONFIRMED' };
    return { ok: false, reason: 'NO_SUITABLE_POOL' };
  },
});

register({
  id: 'ACC_ACCESSIBLE_BED', scope: 'accommodation', kind: 'hard', risk: 'high',
  label: 'Declared accessibility needs get a bed that meets them',
  appliesTo: (p) => p.accessibility?.status === 'declared',
  check: (p, loc, ctx) => {
    const map = ctx.assumptions.accessibilityRequirementMap || {};
    const needs = new Set((p.accessibility.needs || []).map((n) => map[n] || 'accessible'));
    for (const req of needs) {
      if (loc.kind === 'external') {
        if (loc.accessible === 'yes') continue;
        return { ok: false, reason: loc.accessible === 'unknown' ? 'ACCESS_UNVERIFIED' : 'NO_ACCESSIBLE_BED' };
      }
      if (req === 'accessible' && loc.accessible !== 'yes') return { ok: false, reason: 'NO_ACCESSIBLE_BED' };
      if (req === 'ground_floor' && !(loc.floor === 0 || loc.accessible === 'yes')) return { ok: false, reason: 'NO_ACCESSIBLE_BED' };
    }
    return { ok: true };
  },
});

register({
  id: 'ACC_LOCATION_OPEN', scope: 'accommodation', kind: 'hard', risk: 'high',
  label: 'Room or property is open for the whole stay',
  appliesTo: () => true,
  check: (p, loc) => {
    if (loc.status === 'closed') return { ok: false, reason: 'ROOM_CLOSED' };
    for (const c of loc.closures || []) {
      if (overlaps(p.checkIn, p.checkOut, c.start, c.end)) return { ok: false, reason: 'ROOM_CLOSED' };
    }
    return { ok: true };
  },
});

register({
  id: 'ACC_MINOR_ESCORT', scope: 'accommodation', kind: 'hard', risk: 'high',
  label: 'Minors are housed on the same site as their contingent escort',
  appliesTo: (p) => p.isMinor === true && p.personType === 'participant',
  check: (p, loc, ctx) => {
    const sites = ctx.escortSites.get(p.contingentId);
    return sites && sites.has(loc.site) ? { ok: true } : { ok: false, reason: 'MINOR_NO_ESCORT' };
  },
});

// Twist-ready rules: registered now, disabled until someone turns them on in the Constraint Console.
register({
  id: 'ACC_MAX_DISTANCE', scope: 'accommodation', kind: 'hard', risk: 'medium', defaultEnabled: false,
  defaultParams: { maxKm: 5 },
  label: 'Curfew/safety: no one housed farther than maxKm from campus',
  appliesTo: () => true,
  check: (p, loc, ctx) => (loc.distanceKm || 0) <= ctx.params.maxKm ? { ok: true } : { ok: false, reason: 'OUTSIDE_RADIUS' },
});

register({
  id: 'ACC_MINORS_ON_CAMPUS', scope: 'accommodation', kind: 'hard', risk: 'high', defaultEnabled: false,
  label: 'Minors must stay on the campus site',
  appliesTo: (p) => p.isMinor === true,
  check: (p, loc) => (loc.site === 'campus' ? { ok: true } : { ok: false, reason: 'OUTSIDE_RADIUS' }),
});

register({
  id: 'ACC_TRANSPORT_REQUIRED', scope: 'accommodation', kind: 'hard', risk: 'medium', defaultEnabled: false,
  label: 'External properties must have full shuttle transport (excludes "limited")',
  appliesTo: () => true,
  check: (p, loc) => (loc.kind !== 'external' || loc.transport === 'yes' ? { ok: true } : { ok: false, reason: 'OUTSIDE_RADIUS' }),
});

// Soft rules: return a penalty; the allocator multiplies by the strategy weight named in weightKey.
register({
  id: 'ACC_COHESION_SITE', scope: 'accommodation', kind: 'soft', weightKey: 'site', risk: 'medium',
  label: 'Keep a contingent on as few sites as possible',
  appliesTo: (p) => p.personType !== 'escort',
  penalty: (p, loc, ctx) => {
    const sites = ctx.contingentSites.get(p.contingentId);
    if (!sites || sites.size === 0) return 0;
    return sites.has(loc.site) ? 0 : 1;
  },
});

register({
  id: 'ACC_COHESION_GROUP', scope: 'accommodation', kind: 'soft', weightKey: 'group', risk: 'low',
  label: 'Keep a contingent in as few blocks/properties as possible',
  appliesTo: (p) => p.personType !== 'escort',
  penalty: (p, loc, ctx) => {
    const groups = ctx.contingentGroups.get(p.contingentId);
    if (!groups || groups.size === 0) return 0;
    return groups.has(loc.group) ? 0 : 1;
  },
});

register({
  id: 'ACC_COST', scope: 'accommodation', kind: 'soft', weightKey: 'cost', risk: 'low',
  label: 'Prefer cheaper beds (cost per night / 1000)',
  appliesTo: () => true,
  penalty: (p, loc) => (loc.costPerNight || 0) / 1000,
});

register({
  id: 'ACC_DISTANCE', scope: 'accommodation', kind: 'soft', weightKey: 'distance', risk: 'low',
  label: 'Prefer beds closer to campus (km / 10)',
  appliesTo: () => true,
  penalty: (p, loc) => (loc.distanceKm || 0) / 10,
});

register({
  id: 'ACC_PREFERENCES', scope: 'accommodation', kind: 'soft', weightKey: 'preference', risk: 'low',
  label: 'Respect contingent preferences (ground floor, same floor, near venue, low cost)',
  appliesTo: (p) => p.personType !== 'escort',
  penalty: (p, loc, ctx) => {
    const prefs = ctx.contingentPrefs.get(p.contingentId) || [];
    let pen = 0;
    if (prefs.includes('ground_floor') && loc.kind === 'hostel' && loc.floor !== 0) pen += 1;
    if (prefs.includes('same_floor') && loc.kind === 'hostel') {
      const floors = ctx.contingentFloors.get(p.contingentId);
      if (floors && floors.size && !floors.has(`${loc.group}-${loc.floor}`)) pen += 1;
    }
    if (prefs.includes('near_venue')) pen += (loc.distanceKm || 0) / 5;
    if (prefs.includes('low_cost')) pen += (loc.costPerNight || 0) / 1000;
    if (prefs.includes('quiet_rooms') && loc.kind === 'hostel' && loc.capacity >= 4) pen += 0.5;
    return pen;
  },
});
