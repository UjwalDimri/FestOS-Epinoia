// Loads the current festival state from MongoDB into plain objects the pure engines can read.
import * as M from '../models/index.js';
import { getAssumptions } from './assumptions.js';
import { loadConstraintSettings } from '../constraints/index.js';
import { allocate } from '../engines/allocation.js';
import { generateSchedule } from '../engines/schedule.js';
import { dietCoverage, summarizeCoverage } from '../engines/food.js';
import { istDateKey, parseIST, dateRangeKeys } from '../utils/time.js';

const inSession = (query, session) => session ? query.session(session) : query;

export async function loadState(session) {
  const reads = [
    () => getAssumptions(session), () => loadConstraintSettings(session),
    () => inSession(M.Participant.find({}).select('+contact'), session).lean(),
    () => inSession(M.Contingent.find({}), session).lean(),
    () => inSession(M.Room.find({}), session).lean(),
    () => inSession(M.ExternalProperty.find({}), session).lean(),
    () => inSession(M.Event.find({}), session).lean(),
    () => inSession(M.Venue.find({}), session).lean(),
    () => inSession(M.Registration.find({}), session).lean(),
    () => inSession(M.StockBalance.find({}), session).lean(),
    () => inSession(M.Vendor.find({}), session).lean(),
    () => inSession(M.VendorIncident.find({}), session).lean(),
    () => inSession(M.Judge.find({}), session).lean(),
  ];
  let values;
  if (session) {
    values = [];
    for (const read of reads) values.push(await read());
  } else {
    values = await Promise.all(reads.map((read) => read()));
  }
  const [assumptions, settings, people, contingents, rooms, properties, events, venues, registrations, stock, vendors, incidents, judges] = values;
  return { assumptions, settings, people, contingents, rooms, properties, events, venues, registrations, stock, vendors, incidents, judges };
}

export async function activePlan(type, session) {
  return inSession(M.Plan.findOne({ type, status: 'active' }), session).lean();
}

export function accommodationRun(state, { strategy = 'balanced', budgetMode = 'respect', pinned = [], people, rooms, properties } = {}) {
  return allocate({
    people: people || state.people,
    rooms: rooms || state.rooms,
    properties: properties || state.properties,
    contingents: state.contingents,
    assumptions: state.assumptions,
    settings: state.settings,
    strategy,
    budgetMode,
    pinned,
  });
}

export function scheduleRun(state, overrides = {}) {
  const venues = overrides.venues || state.venues;
  const stock = overrides.stock || state.stock;
  return generateSchedule({
    events: state.events, venues, participants: overrides.participants || state.people, registrations: state.registrations,
    stock, assumptions: { ...state.assumptions, capacityFactor: state.assumptions.capacityFactor ?? 1 }, settings: state.settings, judges: state.judges,
  });
}

export function foodRun(state, opts = {}) {
  const days = dateRangeKeys('2026-10-30', '2026-11-01');
  const rows = dietCoverage({
    vendors: opts.vendors || state.vendors, incidents: opts.incidents || state.incidents, people: state.people, days,
    mealWindows: state.assumptions.mealWindows, dietServedBy: state.assumptions.dietServedBy, overrides: opts.overrides || {},
  });
  return { rows, summary: summarizeCoverage(rows) };
}

export function nowFromAssumptions(a) {
  return a.simNow ? parseIST(a.simNow) : new Date();
}

export { istDateKey };
