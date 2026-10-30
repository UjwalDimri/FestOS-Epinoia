import { Assumption } from '../models/index.js';

// Every number the data pack does not provide. Stored in MongoDB, shown in the UI, editable by the Director with a reason.
export const DEFAULT_ASSUMPTIONS = {
  externalBudgetINR: { value: 2500000, description: 'Total budget for external stays (INR)', why: 'Not in the data; the Director sets it' },
  cleaningBufferHours: { value: 3, description: 'Gap between one guest checking out and the next checking in', why: 'Not in the data; brief rule 5' },
  campusRadiusKm: { value: 1, description: 'Properties within this distance count as the campus site (escort coverage, cohesion)', why: 'Campus Guest House is 1 km away' },
  accessibilityRequirementMap: {
    value: { wheelchair: 'accessible', near_washroom: 'accessible', ground_floor: 'ground_floor', visual_assistance: 'ground_floor' },
    description: 'What each declared need requires from a room: accessible = room marked accessible; ground_floor = floor 0 or verified accessible',
    why: 'hostels.csv only has an accessible yes/no flag and a floor number',
  },
  strategyWeights: {
    value: {
      cost_first: { cost: 3, site: 1, group: 0.2, distance: 0.5, preference: 0.5 },
      cohesion_first: { cost: 0.5, site: 6, group: 1, distance: 1, preference: 1 },
      balanced: { cost: 1.5, site: 3, group: 0.5, distance: 1, preference: 1 },
    },
    description: 'Soft-constraint weights per allocation strategy', why: 'Team choice; compare strategies side by side',
  },
  festWindow: { value: { start: '2026-10-30 08:00', end: '2026-11-01 20:00' }, description: 'Event window (IST)', why: 'From venue availability windows' },
  venueFeatures: {
    value: {
      V01: ['stage', 'lights', 'audio', 'seating', 'power'],
      V02: ['projector', 'seating', 'audio', 'power', 'tables'],
      V03: ['projector', 'seating', 'audio', 'power', 'tables'],
      V04: ['open ground', 'stage', 'audio', 'seating'],
      V05: ['open ground'],
      V06: ['open ground'],
      V07: ['projector', 'seating', 'power', 'tables', 'quiet room'],
      V08: ['open ground', 'power', 'seating'],
      V09: ['quiet room', 'tables', 'power'],
    },
    description: 'Features each venue offers, matched against event venue requirements', why: 'venues.csv lists only capacity and indoor/outdoor; Events Team verifies',
  },
  maxHeatSize: { value: 120, description: 'Maximum participants in one heat (also capped by venue capacity)', why: 'Not in the data' },
  minPrelimHeats: { value: 2, description: 'Minimum heats for a first round, so late arrivals have a second chance', why: '725 participants arrive on 31 Oct' },
  semisFraction: { value: 0.25, description: 'Share of first-round participants who reach the semis', why: 'Not in the data' },
  finalistsCount: { value: 8, description: 'Finalists per event', why: 'Not in the data' },
  setupMinutes: { value: 15, description: 'Venue setup before each slot', why: 'Not in the data' },
  teardownMinutes: { value: 15, description: 'Venue teardown after each slot', why: 'Not in the data' },
  roundGapMinutes: { value: 60, description: 'Minimum gap between the end of one round and the start of the next', why: 'Not in the data' },
  travelBufferMinutes: { value: 15, description: 'Minimum gap for a participant moving between venues', why: 'Not in the data' },
  arrivalReadyMinutes: { value: 60, description: 'A participant must have arrived this long before a slot starts', why: 'Check-in and travel from the gate' },
  volunteerPool: { value: 60, description: 'Student volunteers available at any time (core_team lists only 6 Volunteers)', why: 'Not in the data' },
  judgesPerEvent: { value: 2, description: 'Placeholder judges assigned per event', why: 'Judges are not in the data' },
  judgePoolSize: { value: 30, description: 'Number of placeholder judges seeded', why: 'Judges are not in the data' },
  mealWindows: { value: { breakfast: ['07:30', '09:30'], lunch: ['12:30', '14:30'], dinner: ['19:30', '21:30'] }, description: 'Meal service windows (IST)', why: 'Not in the data' },
  dietServedBy: {
    value: {
      vegetarian: ['vegetarian', 'vegan', 'jain'],
      non_vegetarian: ['*'],
      halal: ['halal'],
      jain: ['jain'],
      gluten_free: ['gluten-free'],
      nut_allergy: ['nut-free'],
      unknown: ['*'],
    },
    description: 'Which vendor tags can serve each diet group (* = any vendor)', why: 'Conservative: only explicit tags count; blank dietary is never clearance',
  },
  merchEntitlements: {
    value: { 'T-shirt': 'participants', 'ID card': 'everyone', lanyard: 'everyone', tote: 'participants', 'winner medal': 'winners', 'special badge': 'leaders_escorts' },
    description: 'Who is entitled to each merch item', why: 'Not in the data',
  },
  winnersPerEvent: { value: 3, description: 'Medals needed per event', why: 'Not in the data' },
  narrativeExpectedParticipants: { value: 2400, description: 'Headcount stated in the brief narrative', why: 'Treated as an older planning estimate; reconciled, not used for planning' },
  escalationMinutes: { value: 15, description: 'Unacknowledged alerts escalate to the Festival Director after this many minutes', why: 'Team choice' },
  unplacedArrivalWindowHours: { value: 6, description: 'Alert when someone without a bed arrives within this many hours', why: 'Team choice' },
  simNow: { value: null, description: 'Simulated clock for demos (IST "YYYY-MM-DD HH:mm"); null = real time', why: 'Lets judges move time during the live test' },
};

let cache = null;

export async function ensureAssumptions() {
  const existing = await Assumption.find({}, { key: 1 }).lean();
  const have = new Set(existing.map((a) => a.key));
  const missing = Object.entries(DEFAULT_ASSUMPTIONS).filter(([k]) => !have.has(k))
    .map(([key, v]) => ({ key, ...v }));
  if (missing.length) await Assumption.insertMany(missing);
  cache = null;
}

export async function getAssumptions() {
  if (cache) return cache;
  const docs = await Assumption.find({}).lean();
  const out = Object.fromEntries(Object.entries(DEFAULT_ASSUMPTIONS).map(([k, v]) => [k, v.value]));
  for (const d of docs) out[d.key] = d.value;
  cache = out;
  return out;
}

export function invalidateAssumptions() { cache = null; }
