import { register } from './registry.js';
import { overlaps } from '../utils/time.js';

// subject = slot spec { eventId, expectedSize, requirements }, candidate = { venue, start, end, occStart, occEnd }

register({
  id: 'SCH_VENUE_FEATURES', scope: 'schedule_venue', kind: 'hard', risk: 'medium',
  label: 'Venue offers every feature the event requires (venue feature map is an assumption)',
  appliesTo: () => true,
  check: (s, c, ctx) => {
    const feats = new Set(ctx.assumptions.venueFeatures?.[c.venue.venueId] || []);
    return (s.requirements || []).every((r) => feats.has(r)) ? { ok: true } : { ok: false, reason: 'VENUE_FEATURES_MISSING' };
  },
});

register({
  id: 'SCH_VENUE_CAPACITY', scope: 'schedule_venue', kind: 'hard', risk: 'high',
  label: 'Heat size fits the venue capacity (x capacity factor)',
  appliesTo: () => true,
  check: (s, c, ctx) => (s.expectedSize <= Math.floor(c.venue.capacity * ctx.capacityFactor) ? { ok: true } : { ok: false, reason: 'CAPACITY_EXCEEDED' }),
});

register({
  id: 'SCH_VENUE_WINDOW', scope: 'schedule_venue', kind: 'hard', risk: 'high',
  label: 'Slot (with setup and teardown) is inside a venue availability window',
  appliesTo: () => true,
  check: (s, c) => ((c.venue.windows || []).some((w) => new Date(w.start) <= c.occStart && c.occEnd <= new Date(w.end))
    ? { ok: true } : { ok: false, reason: 'VENUE_OUTSIDE_WINDOW' }),
});

register({
  id: 'SCH_VENUE_OPEN', scope: 'schedule_venue', kind: 'hard', risk: 'high',
  label: 'Venue is not closed (venue-change disruptions add closures)',
  appliesTo: () => true,
  check: (s, c) => ((c.venue.closures || []).some((cl) => overlaps(c.occStart, c.occEnd, cl.start, cl.end))
    ? { ok: false, reason: 'VENUE_CLOSED' } : { ok: true }),
});

register({
  id: 'SCH_OUTDOOR_CLOSED', scope: 'schedule_venue', kind: 'hard', risk: 'medium', defaultEnabled: false,
  defaultParams: { start: '2026-10-31 14:00', end: '2026-11-01 20:00' },
  label: 'Weather advisory: outdoor venues closed between start and end (IST)',
  appliesTo: () => true,
  check: (s, c, ctx) => {
    if (c.venue.indoorOutdoor !== 'outdoor') return { ok: true };
    return overlaps(c.occStart, c.occEnd, ctx.parseIST(ctx.params.start), ctx.parseIST(ctx.params.end))
      ? { ok: false, reason: 'OUTDOOR_CLOSED' } : { ok: true };
  },
});

// Engine-level schedule rules (stateful); listed here so the Constraint Console can show and toggle them.
const engineRules = [
  ['SCH_NO_DOUBLE_BOOKING', 'hard', 'high', 'A venue hosts one slot at a time (including setup/teardown)'],
  ['SCH_JUDGE_CLASH', 'hard', 'high', 'A judge is never in two overlapping slots'],
  ['SCH_ROUND_ORDER', 'hard', 'high', 'Semis start after all prelims end; finals after all semis end (+ round gap)'],
  ['SCH_PARTICIPANT_CLASH', 'soft', 'high', 'A participant is never in two overlapping slots'],
  ['SCH_TRAVEL_BUFFER', 'soft', 'medium', 'Participants get the travel buffer between slots at different venues'],
  ['SCH_PRESENCE', 'soft', 'medium', 'A participant is on site (arrived + ready time, not departed) for each slot'],
  ['SCH_EQUIPMENT', 'soft', 'medium', 'Concurrent equipment demand never exceeds usable stock'],
  ['SCH_VOLUNTEERS', 'soft', 'low', 'Concurrent volunteer demand never exceeds the volunteer pool'],
];
for (const [id, kind, risk, label] of engineRules) {
  register({ id, scope: 'schedule', kind, risk, label, engineLevel: true });
}

register({
  id: 'SCH_CAPACITY_FACTOR', scope: 'schedule', kind: 'hard', risk: 'high', defaultEnabled: false, engineLevel: true,
  defaultParams: { factor: 0.75 },
  label: 'Fire-safety occupancy cap: usable venue capacity = capacity x factor',
});
