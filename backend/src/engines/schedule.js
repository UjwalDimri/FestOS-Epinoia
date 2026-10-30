// Schedule generator + clash detector. Pure: people, venues, events in -> slots + clashes out.
// Round 1 (prelims) uses real registrations. Later rounds are sized from the fraction assumptions and have no
// participants yet (they are filled from results), so they are reported as "unscheduled until results", not invented.
import { addMinutes, overlaps } from '../utils/time.js';
import { activeFor } from '../constraints/registry.js';

const DAY_START = [8, 0];
const DAY_END = [22, 0];
const STEP_MIN = 30;

const hm = (d, h, m) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`);

function candidateStarts(windows, durationMin, lengthMin) {
  const out = [];
  for (const w of windows) {
    const days = new Set();
    for (let t = new Date(w.start).getTime(); t < new Date(w.end).getTime(); t += 86400000) {
      days.add(new Date(t + 19800000).toISOString().slice(0, 10));
    }
    for (const d of days) {
      for (let h = DAY_START[0]; h < DAY_END[0]; h += STEP_MIN / 60) {
        const start = hm(d, Math.floor(h), (h % 1) * 60);
        const end = addMinutes(start, durationMin);
        if (new Date(start) < new Date(w.start) || new Date(end) > new Date(w.end)) continue;
        out.push(start);
      }
    }
  }
  return out;
}

export function generateSchedule({ events, venues, participants, registrations, stock, assumptions, settings = {}, judges = [] }) {
  const factor = assumptions.capacityFactor ?? 1;
  const feats = assumptions.venueFeatures || {};
  const setup = assumptions.setupMinutes ?? 15;
  const teardown = assumptions.teardownMinutes ?? 15;
  const travel = assumptions.travelBufferMinutes ?? 15;
  const ready = assumptions.arrivalReadyMinutes ?? 60;
  const maxHeat = assumptions.maxHeatSize ?? 120;
  const minHeats = assumptions.minPrelimHeats ?? 2;
  const volPool = assumptions.volunteerPool ?? 60;
  const semisF = assumptions.semisFraction ?? 0.25;
  const finalists = assumptions.finalistsCount ?? 8;
  const roundGap = assumptions.roundGapMinutes ?? 60;
  const hard = new Set(activeFor('schedule_venue', settings).map((c) => c.id));
  const byId = new Map(participants.map((p) => [p.participantId, p]));

  // Equipment usable stock (good, not reserved elsewhere)
  const usable = new Map();
  for (const s of stock) if (s.state === 'available') usable.set(s.item, (usable.get(s.item) || 0) + s.qty);

  const regsByEvent = new Map();
  for (const r of registrations) {
    if (!r.active) continue;
    if (!regsByEvent.has(r.eventId)) regsByEvent.set(r.eventId, []);
    regsByEvent.get(r.eventId).push(r.participantId);
  }

  const busy = new Map();      // participantId -> [{start,end,venue}]
  const venueBusy = new Map(); // venueId -> [{start,end}]
  const judgeBusy = new Map(); // judgeId -> [{start,end}]
  const volBusy = [];          // [{start,end,n}]
  const equipBusy = new Map(); // item -> [{start,end,qty}]
  const slots = [];
  const unscheduled = [];
  const clashes = [];

  const addBusy = (map, key, iv) => { if (!map.has(key)) map.set(key, []); map.get(key).push(iv); };
  const freeFor = (list, s, e) => list.every((iv) => !overlaps(s, e, iv.start, iv.end));
  const concurrentAt = (list, s, e, field = 'n') => list
    .filter((iv) => overlaps(s, e, iv.start, iv.end)).reduce((t, iv) => t + (iv[field] || 1), 0);

  // Round 1: heats per event
  const eventsSorted = [...events].sort((a, b) => (b.volunteersNeeded || 0) - (a.volunteersNeeded || 0) || a.eventId.localeCompare(b.eventId));
  for (const ev of eventsSorted) {
    // Heat assignment lever: group people by arrival so each heat is mostly on site at the same time.
    const ids = [...new Set(regsByEvent.get(ev.eventId) || [])]
      .filter((id) => byId.has(id))
      .sort((a, b) => new Date(byId.get(a).arrivalDateTime) - new Date(byId.get(b).arrivalDateTime) || a.localeCompare(b));
    const heats = Math.max(minHeats, Math.ceil(ids.length / maxHeat));
    const heatSize = Math.ceil(ids.length / heats);
    const reqs = ev.venueRequirements || [];
    const dur = ev.durationMinutes || 60;
    const occLen = setup + dur + teardown;

    for (let h = 1; h <= heats; h++) {
      const members = ids.slice((h - 1) * heatSize, h * heatSize);
      const need = members.length;
      const volNeed = ev.volunteersNeeded || 0;
      let best = null;
      const reasons = new Set();
      for (const v of venues) {
        const vf = new Set(feats[v.venueId] || []);
        if (hard.has('SCH_VENUE_FEATURES') && !reqs.every((r) => vf.has(r))) { reasons.add('VENUE_FEATURES_MISSING'); continue; }
        if (hard.has('SCH_VENUE_CAPACITY') && need > Math.floor(v.capacity * factor)) { reasons.add('CAPACITY_EXCEEDED'); continue; }
        const starts = candidateStarts(v.windows || [], dur, occLen);
        for (const start of starts) {
          const occStart = addMinutes(start, -setup);
          const occEnd = addMinutes(start, dur + teardown);
          if (hard.has('SCH_VENUE_WINDOW') && !(v.windows || []).some((w) => new Date(w.start) <= occStart && occEnd <= new Date(w.end))) { reasons.add('VENUE_OUTSIDE_WINDOW'); continue; }
          if (hard.has('SCH_VENUE_OPEN') && (v.closures || []).some((c) => overlaps(occStart, occEnd, c.start, c.end))) { reasons.add('VENUE_CLOSED'); continue; }
          if (hard.has('SCH_OUTDOOR_CLOSED') && v.indoorOutdoor === 'outdoor' && settings.SCH_OUTDOOR_CLOSED?.enabled) {
            const p = settings.SCH_OUTDOOR_CLOSED.params || {};
            if (overlaps(occStart, occEnd, new Date(p.start), new Date(p.end))) { reasons.add('OUTDOOR_CLOSED'); continue; }
          }
          if (!freeFor(venueBusy.get(v.venueId) || [], occStart, occEnd)) continue;

          // participant clashes and presence
          let clash = 0; let travelClash = 0; let notPresent = 0;
          for (const pid of members) {
            const p = byId.get(pid);
            if (!p) continue;
            if (!(p.arrivalDateTime && new Date(p.arrivalDateTime).getTime() + ready * 60000 <= start.getTime()) || new Date(p.departureDateTime) <= addMinutes(start, dur)) notPresent++;
            for (const iv of busy.get(pid) || []) {
              if (overlaps(start, addMinutes(start, dur), iv.start, iv.end)) clash++;
              else if (iv.venue !== v.venueId && overlaps(addMinutes(start, -travel), addMinutes(start, dur + travel), iv.start, iv.end)) travelClash++;
            }
          }
          const judgesFree = (ev.judgeIds || []).filter((j) => freeFor(judgeBusy.get(j) || [], occStart, occEnd)).length;
          const judgeShort = (ev.judgeIds || []).length - judgesFree;
          const volShort = Math.max(0, concurrentAt(volBusy, occStart, occEnd) + volNeed - volPool);
          let equipShort = 0;
          for (const eq of ev.equipmentNeeds || []) {
            const have = usable.get(eq.item) || 0;
            const inUse = concurrentAt(equipBusy.get(eq.item) || [], occStart, occEnd, 'qty');
            equipShort += Math.max(0, inUse + eq.qty - have);
          }
          const cost = clash * 100 + notPresent * 20 + travelClash * 5 + judgeShort * 50 + volShort * 3 + equipShort * 10 + (start - new Date(occStart)) * 0;
          if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && start < best.start)) {
            best = { venue: v, start, occStart, occEnd, cost, clash, notPresent, travelClash, judgeShort, volShort, equipShort };
          }
        }
      }
      const slotId = `${ev.eventId}-R1-H${h}`;
      if (!best) {
        unscheduled.push({ slotId, eventId: ev.eventId, round: 'prelims', heat: h, expectedSize: need, reasonCodes: [...reasons].slice(0, 3) || ['NO_VENUE'] });
        continue;
      }
      const codes = [];
      if (best.clash) codes.push('PARTICIPANT_CLASH');
      if (best.notPresent) codes.push('NOT_PRESENT');
      if (best.travelClash) codes.push('TRAVEL_BUFFER');
      if (best.judgeShort) codes.push('JUDGE_SHORT');
      if (best.volShort) codes.push('VOLUNTEER_SHORT');
      if (best.equipShort) codes.push('EQUIPMENT_SHORT');
      if (!codes.length) codes.push('CLEAR');
      const slot = {
        slotId, eventId: ev.eventId, round: 'prelims', heat: h, venueId: best.venue.venueId,
        start: best.start, end: addMinutes(best.start, dur), setupMinutes: setup, teardownMinutes: teardown,
        expectedSize: need, participantIds: members, participantsKnown: true,
        judgeIds: (ev.judgeIds || []).slice(0, 2), volunteersNeeded: volNeed,
        equipment: ev.equipmentNeeds || [], status: 'scheduled', reasonCodes: codes,
      };
      slots.push(slot);
      addBusy(venueBusy, best.venue.venueId, { start: best.occStart, end: best.occEnd });
      for (const pid of members) addBusy(busy, pid, { start: best.start, end: addMinutes(best.start, dur), venue: best.venue.venueId });
      for (const j of ev.judgeIds || []) addBusy(judgeBusy, j, { start: best.occStart, end: best.occEnd });
      volBusy.push({ start: best.occStart, end: best.occEnd, n: volNeed });
      for (const eq of ev.equipmentNeeds || []) addBusy(equipBusy, eq.item, { start: best.occStart, end: best.occEnd, qty: eq.qty });
      if (best.clash) clashes.push({ slotId, kind: 'PARTICIPANT_CLASH', count: best.clash });
      if (best.travelClash) clashes.push({ slotId, kind: 'TRAVEL_BUFFER', count: best.travelClash });
      if (best.notPresent) clashes.push({ slotId, kind: 'NOT_PRESENT', count: best.notPresent });
      if (best.judgeShort) clashes.push({ slotId, kind: 'JUDGE_SHORT', count: best.judgeShort });
      if (best.volShort) clashes.push({ slotId, kind: 'VOLUNTEER_SHORT', count: best.volShort });
      if (best.equipShort) clashes.push({ slotId, kind: 'EQUIPMENT_SHORT', count: best.equipShort });
    }

    // Later rounds: sized from the fraction assumptions, scheduled after the prelims finish, no participants yet.
    const sizes = [];
    if (ev.rounds?.includes('semis')) sizes.push({ round: 'semis', size: Math.max(finalists, Math.round(ids.length * semisF)) });
    if (ev.rounds?.includes('finals')) sizes.push({ round: 'finals', size: finalists });
    const lastEnd = slots.filter((s) => s.eventId === ev.eventId).reduce((m, s) => (s.end > m ? s.end : m), new Date(0));
    let cursorBase = new Date(lastEnd.getTime() + roundGap * 60000);
    for (const s of sizes) {
      const v = venues.find((x) => (feats[x.venueId] || []).includes((ev.venueRequirements || [])[0] || '') && s.size <= Math.floor(x.capacity * factor));
      unscheduled.push({ slotId: `${ev.eventId}-${s.round.toUpperCase()}`, eventId: ev.eventId, round: s.round, heat: 1,
        expectedSize: s.size, earliestStart: cursorBase, venueHint: v?.venueId || null,
        reasonCodes: ['AWAITING_RESULTS'], status: 'unscheduled' });
    }
  }

  // Validate: any slot that starts before a participant has arrived is a clash too, already counted above.
  return { slots, unscheduled, clashes, summary: summarize(slots, unscheduled, clashes) };
}

function summarize(slots, unscheduled, clashes) {
  const count = (k) => clashes.filter((c) => c.kind === k).reduce((s, c) => s + c.count, 0);
  return {
    slots: slots.length,
    unscheduledRounds: unscheduled.length,
    participantClashes: count('PARTICIPANT_CLASH'),
    notPresent: count('NOT_PRESENT'),
    travelBuffer: count('TRAVEL_BUFFER'),
    judgeShortfall: count('JUDGE_SHORT'),
    volunteerShortfall: count('VOLUNTEER_SHORT'),
    equipmentShortfall: count('EQUIPMENT_SHORT'),
    cleanSlots: slots.filter((s) => s.reasonCodes.includes('CLEAR')).length,
  };
}

// Conflict detector used for manual edits: checks one proposed slot against everything else in the plan.
export function checkSlot(slot, plan) {
  const issues = [];
  for (const other of plan) {
    if (other.slotId === slot.slotId) continue;
    if (other.venueId === slot.venueId && overlaps(slot.start, slot.end, other.start, other.end)) issues.push({ kind: 'VENUE_DOUBLE_BOOKED', with: other.slotId });
    const shared = (slot.participantIds || []).filter((p) => (other.participantIds || []).includes(p));
    if (shared.length && overlaps(slot.start, slot.end, other.start, other.end)) issues.push({ kind: 'PARTICIPANT_CLASH', with: other.slotId, count: shared.length });
  }
  return issues;
}
