import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { readCsv } from '../utils/csv.js';
import { parseIST, fmtIST, parseShift } from '../utils/time.js';
import * as M from '../models/index.js';
import { ensureAssumptions, getAssumptions, invalidateAssumptions } from '../services/assumptions.js';
import { normalizeParticipant, parsePreferences, parseEquipment, parseRequirements, parseWindows,
  normalizeStaff, stateFromCondition, parseVendor, vendorLabelConflicts } from './normalize.js';
import { findDuplicateCandidates } from './dedupe.js';
import { ROLES } from '../shared/roles.js';

const issue = (code, severity, entityType, entityId, message, details) => ({ code, severity, entity: { type: entityType, id: entityId }, message, details });

export async function runImport({ dataDir = env.dataDir, log = console.log } = {}) {
  // Fresh demo state: drop every collection we own.
  for (const name of Object.keys(mongoose.connection.collections)) {
    await mongoose.connection.collections[name].deleteMany({});
  }
  await Promise.all(Object.values(M).map((m) => m.syncIndexes?.()));
  await ensureAssumptions();
  invalidateAssumptions();
  const A = await getAssumptions();
  const festStart = parseIST(A.festWindow.start);
  const festEnd = parseIST(A.festWindow.end);
  const issues = [];

  // --- contingents
  const contingentRows = readCsv(dataDir, 'contingents.csv');
  const contingents = contingentRows.map((r) => ({
    contingentId: r.contingent_id, college: r.college, leader: r.leader, escort: r.escort,
    strengthDeclared: Number(r.strength_declared), preferencesRaw: r.preferences, preferences: parsePreferences(r.preferences),
  }));

  // --- participants
  const pRows = readCsv(dataDir, 'participants.csv');
  const participants = [];
  for (const row of pRows) {
    const { doc, issues: pi } = normalizeParticipant(row, festEnd);
    participants.push(doc);
    for (const i of pi) issues.push(issue(i.code, i.severity, 'Participant', doc.participantId, i.message));
  }

  // --- leaders: link by exact name within the contingent, but say how the link was made
  const byContingent = new Map();
  for (const p of participants) {
    if (!byContingent.has(p.contingentId)) byContingent.set(p.contingentId, []);
    byContingent.get(p.contingentId).push(p);
  }
  for (const c of contingents) {
    const members = byContingent.get(c.contingentId) || [];
    const matches = members.filter((p) => p.name.trim().toLowerCase() === String(c.leader).trim().toLowerCase());
    if (matches.length === 1) {
      matches[0].isLeader = true;
      c.leaderParticipantId = matches[0].participantId;
      issues.push(issue('LEADER_LINKED_BY_NAME', 'low', 'Contingent', c.contingentId, `Leader ${c.leader} linked to ${matches[0].participantId} by name only; verify at check-in.`));
    } else if (matches.length > 1) {
      issues.push(issue('LEADER_AMBIGUOUS', 'medium', 'Contingent', c.contingentId, `${matches.length} participants are named ${c.leader}; leader not linked.`, { candidates: matches.map((m) => m.participantId) }));
    } else {
      issues.push(issue('LEADER_NOT_IN_PARTICIPANTS', 'medium', 'Contingent', c.contingentId, `Leader ${c.leader} has no participant record in this contingent.`));
    }
    const actual = members.length;
    if (actual !== c.strengthDeclared) {
      issues.push(issue('STRENGTH_MISMATCH', 'medium', 'Contingent', c.contingentId,
        `Declared ${c.strengthDeclared}, found ${actual} participant records (${actual - c.strengthDeclared > 0 ? '+' : ''}${actual - c.strengthDeclared}).`,
        { declared: c.strengthDeclared, actual }));
    }
  }

  // --- escorts: named in contingents.csv but absent from participants.csv; created as people who need a bed
  for (const c of contingents) {
    const members = byContingent.get(c.contingentId) || [];
    const valid = members.filter((m) => !m.quarantined && m.arrivalDateTime && m.departureDateTime);
    const arrivalDateTime = valid.length ? new Date(Math.min(...valid.map((m) => m.arrivalDateTime.getTime()))) : festStart;
    const departureDateTime = valid.length ? new Date(Math.max(...valid.map((m) => m.departureDateTime.getTime()))) : festEnd;
    const escortId = `ESC-${c.contingentId}`;
    c.escortPersonId = escortId;
    participants.push({
      participantId: escortId, name: c.escort, contingentId: c.contingentId, college: c.college, personType: 'escort',
      gender: null, housingCategory: 'unconfirmed', age: null, isMinor: false, contact: '',
      accessibilityNeeds: { status: 'not_declared', needs: [] }, dietaryNeeds: { status: 'unknown', needs: [] },
      arrivalDateTime, departureDateTime, accommodationRequested: true, tshirtSize: null, quarantined: false, active: true,
      attrs: { source: 'contingents.csv', assumption: 'Escorts need a private bed near the group; stay spans the contingent window' },
    });
    issues.push(issue('ESCORT_CREATED', 'info', 'Participant', escortId, `Escort ${c.escort} created from contingents.csv (not in participants.csv). Stay ${fmtIST(arrivalDateTime)} to ${fmtIST(departureDateTime)} is assumed.`));
  }
  await M.Contingent.insertMany(contingents);
  await M.Participant.insertMany(participants);

  // --- headcount narrative mismatch (shown, never hidden)
  const declaredTotal = contingents.reduce((s, c) => s + c.strengthDeclared, 0);
  issues.push(issue('HEADCOUNT_MISMATCH', 'info', 'Festival', 'Aarohan',
    `Narrative expects about ${A.narrativeExpectedParticipants}; contingents declare ${declaredTotal}; the pack has ${pRows.length} participant records. See the headcount ladder.`,
    { narrative: A.narrativeExpectedParticipants, declared: declaredTotal, raw: pRows.length }));

  // --- duplicate candidates
  const dupes = findDuplicateCandidates(participants, 80);
  await M.DuplicateCandidate.insertMany(dupes.map((d) => ({ ...d, status: 'open' })));
  for (const d of dupes) {
    issues.push(issue('POSSIBLE_DUPLICATE', d.score >= 90 ? 'high' : 'medium', 'Participant', d.a,
      `${d.a} and ${d.b} match on ${d.matched.join(', ')} (score ${d.score}). Phones differ, so a human must confirm.`, { other: d.b, score: d.score }));
  }

  // --- events, registrations
  const eventRows = readCsv(dataDir, 'events.csv');
  const events = eventRows.map((r) => ({
    eventId: r.event_id, name: r.event_name, type: r.type, rounds: r.rounds.split('|').map((s) => s.trim()),
    durationMinutes: Number(r.duration_minutes), venueRequirements: parseRequirements(r.venue_requirements),
    equipmentNeeds: parseEquipment(r.equipment_needs), volunteersNeeded: Number(r.volunteers_needed), judgeIds: [],
  }));
  issues.push(issue('EVENTS_NOT_SCHEDULED', 'info', 'Festival', 'events.csv', 'events.csv has no dates, times, venues or judges. FestOS generates heats and slots.'));

  const eventType = new Map(events.map((e) => [e.eventId, e.type]));
  const regRows = readCsv(dataDir, 'registrations.csv');
  const quarantinedIds = new Set(participants.filter((p) => p.quarantined).map((p) => p.participantId));
  const teamIssueCounts = new Map();
  const registrations = regRows.map((r) => {
    const teamId = r.team_id && r.team_id.trim() ? r.team_id.trim() : null;
    const type = eventType.get(r.event_id);
    let teamIdIssue = null;
    if (type === 'team' && !teamId) teamIdIssue = 'TEAM_EVENT_WITHOUT_TEAM_ID';
    if (type === 'solo' && teamId) teamIdIssue = 'SOLO_EVENT_WITH_TEAM_ID';
    if (teamIdIssue) {
      const k = `${r.event_id}:${teamIdIssue}`;
      teamIssueCounts.set(k, (teamIssueCounts.get(k) || 0) + 1);
    }
    return { participantId: r.participant_id, eventId: r.event_id, teamId, teamIdIssue, active: !quarantinedIds.has(r.participant_id) };
  });
  for (const [k, n] of teamIssueCounts) {
    const [eventId, code] = k.split(':');
    issues.push(issue(code, 'low', 'Event', eventId, `${n} registrations: ${code === 'TEAM_EVENT_WITHOUT_TEAM_ID' ? 'team event but no team_id' : 'solo event but a team_id is set'}. Team grouping treated as unverified.`, { count: n }));
  }
  const teamSizes = new Map();
  for (const r of registrations) if (r.teamId) teamSizes.set(`${r.eventId}:${r.teamId}`, (teamSizes.get(`${r.eventId}:${r.teamId}`) || 0) + 1);
  const singletonTeams = [...teamSizes.values()].filter((n) => n === 1).length;
  issues.push(issue('SINGLE_MEMBER_TEAMS', 'low', 'Festival', 'registrations.csv', `${singletonTeams} team_ids have exactly one member.`, { count: singletonTeams }));
  await M.Registration.insertMany(registrations);

  // --- judges (placeholders: not in the data)
  const judges = Array.from({ length: A.judgePoolSize }, (_, i) => ({ judgeId: `J${String(i + 1).padStart(2, '0')}`, name: `Judge ${i + 1} (placeholder)`, placeholder: true, eventIds: [] }));
  events.forEach((e, idx) => {
    for (let k = 0; k < A.judgesPerEvent; k++) {
      const j = judges[(idx * A.judgesPerEvent + k) % judges.length];
      j.eventIds.push(e.eventId);
      e.judgeIds.push(j.judgeId);
    }
  });
  issues.push(issue('JUDGES_PLACEHOLDER', 'info', 'Festival', 'judges', `${judges.length} placeholder judges seeded (${A.judgesPerEvent} per event). Replace with real names.`));
  await M.Event.insertMany(events);
  await M.Judge.insertMany(judges);

  // --- venues
  const venueRows = readCsv(dataDir, 'venues.csv');
  const venues = venueRows.map((r) => ({ venueId: r.venue_id, name: r.venue_name, capacity: Number(r.capacity), indoorOutdoor: r.indoor_outdoor, windows: parseWindows(r.availability_windows), closures: [] }));
  const lt = venues.filter((v) => /^LT/.test(v.name)).map((v) => v.capacity);
  for (const v of venues) {
    if (/main stage/i.test(v.name) && lt.length && v.capacity < Math.min(...lt)) {
      issues.push(issue('VENUE_CAPACITY_SUSPECT', 'medium', 'Venue', v.venueId, `${v.name} capacity is ${v.capacity}, smaller than the lecture theatres (${lt.join(', ')}). Kept as given; verify.`));
    }
  }
  issues.push(issue('VENUE_FEATURES_ASSUMED', 'info', 'Festival', 'venues.csv', 'venues.csv has no features (audio, projector, stage). A team-defined feature map is used; see assumptions.'));
  await M.Venue.insertMany(venues);

  // --- hostels and external stays
  const hostelRows = readCsv(dataDir, 'hostels.csv');
  await M.Room.insertMany(hostelRows.map((r) => ({
    roomId: r.room_id, block: r.block, floor: Number(r.floor), gender: r.gender === 'girls' ? 'girls' : r.gender === 'boys' ? 'boys' : 'all_gender',
    capacity: Number(r.capacity), accessibility: r.accessibility === 'yes' ? 'yes' : r.accessibility === 'no' ? 'no' : 'unknown',
    status: r.status === 'available' ? 'available' : 'closed', closures: [],
  })));
  const extRows = readCsv(dataDir, 'external_stays.csv');
  await M.ExternalProperty.insertMany(extRows.map((r) => ({
    propertyId: r.property_id, propertyName: r.property_name, beds: Number(r.beds), costPerBedPerNight: Number(r.cost_per_bed_per_night),
    distanceKm: Number(r.distance_km), transportAvailability: r.transport_availability, accessibility: 'unknown', status: 'available', closures: [],
  })));
  for (const r of extRows) {
    issues.push(issue('ACCESSIBILITY_UNKNOWN', 'medium', 'ExternalProperty', r.property_id, `${r.property_name}: no accessibility data. Treated as unknown until someone verifies it.`));
    if (r.transport_availability !== 'yes') issues.push(issue('TRANSPORT_LIMITED', 'medium', 'ExternalProperty', r.property_id, `${r.property_name} (${r.distance_km} km) has ${r.transport_availability} transport.`));
  }

  // --- logistics inventory
  const invRows = readCsv(dataDir, 'inventory_logistics.csv');
  await M.InventoryLine.insertMany(invRows.map((r) => ({ itemId: r.item_id, item: r.item, quantity: Number(r.quantity), location: r.location, condition: r.condition })));
  const balances = new Map();
  for (const r of invRows) {
    const state = stateFromCondition(r.condition, r.location);
    const k = `${r.item}|${r.location}|${state}`;
    balances.set(k, (balances.get(k) || 0) + Number(r.quantity));
  }
  await M.StockBalance.insertMany([...balances].map(([k, qty]) => { const [item, location, state] = k.split('|'); return { item, location, state, qty }; }));
  const usable = new Map();
  for (const r of invRows) if (stateFromCondition(r.condition, r.location) === 'available') usable.set(r.item, (usable.get(r.item) || 0) + Number(r.quantity));
  for (const item of new Set(invRows.map((r) => r.item))) {
    if (!usable.get(item)) issues.push(issue('ITEM_NO_USABLE_STOCK', 'high', 'Inventory', item, `No usable ${item} in stock: every unit is under repair, needs a check, or is in transit.`));
  }
  if (invRows.some((r) => /^van/i.test(r.location))) issues.push(issue('STOCK_IN_TRANSIT', 'info', 'Inventory', 'Van 1', 'Stock located in Van 1 is treated as in transit until delivered.'));

  // --- merch
  const merchRows = readCsv(dataDir, 'inventory_merch.csv');
  await M.MerchStock.insertMany(merchRows.map((r) => ({ item: r.item, size: r.size && r.size.trim() ? r.size.trim() : '-', quantity: Number(r.quantity), reserved: Number(r.reserved_quantity), issued: 0 })));

  // --- vendors
  const vendorRows = readCsv(dataDir, 'vendors.csv');
  const vendors = vendorRows.map(parseVendor);
  await M.Vendor.insertMany(vendors);
  for (const v of vendors) {
    if (v.certExpiry < festStart) issues.push(issue('CERT_EXPIRED', 'high', 'Vendor', v.vendorId, `${v.name} (${v.menu}): hygiene certificate expired ${fmtIST(v.certExpiry).slice(0, 10)}. Blocked unless the Director overrides.`));
    else if (v.certExpiry < festEnd) issues.push(issue('CERT_EXPIRES_DURING_FEST', 'medium', 'Vendor', v.vendorId, `${v.name} (${v.menu}): certificate expires ${fmtIST(v.certExpiry).slice(0, 10)}, during the fest.`));
    for (const msg of vendorLabelConflicts(v)) issues.push(issue('VENDOR_LABEL_CONFLICT', 'medium', 'Vendor', v.vendorId, `${v.name}: ${msg}.`));
  }

  // --- staff + coverage gaps
  const staffRows = readCsv(dataDir, 'core_team.csv').map(normalizeStaff);
  await M.Staff.insertMany(staffRows);
  for (const role of Object.keys(ROLES)) {
    const covered = new Array(24).fill(false);
    for (const s of staffRows.filter((x) => x.role === role)) {
      for (const [a, b] of parseShift(s.shift)) for (let h = Math.floor(a / 60); h < Math.ceil(b / 60); h++) covered[h] = true;
    }
    const gaps = [];
    for (let h = 0; h < 24; h++) if (!covered[h]) gaps.push(h);
    if (gaps.length) {
      const ranges = [];
      for (const h of gaps) {
        const last = ranges[ranges.length - 1];
        if (last && last[1] === h) last[1] = h + 1; else ranges.push([h, h + 1]);
      }
      const label = ranges.map(([a, b]) => `${String(a).padStart(2, '0')}:00-${String(b % 24).padStart(2, '0')}:00`).join(', ');
      issues.push(issue('STAFF_COVERAGE_GAP', 'medium', 'Role', role, `No ${ROLES[role]} on shift ${label}.`, { ranges }));
    }
  }
  const directors = staffRows.filter((s) => s.role === 'festival_director').length;
  if (directors > 1) issues.push(issue('MULTIPLE_DIRECTORS', 'info', 'Role', 'festival_director', `${directors} people hold the Festival Director role; name one decision owner per shift.`));

  // --- test users: one per role, linked to the first staff member with that role
  const hash = await bcrypt.hash(env.seedPassword, 10);
  const users = Object.keys(ROLES).map((role) => {
    const staff = staffRows.find((s) => s.role === role);
    const local = { festival_director: 'director', hospitality: 'hospitality', registration_desk: 'registration', events_team: 'events',
      logistics_head: 'logistics', merchandise_desk: 'merch', food_coordinator: 'food', volunteer: 'volunteer' }[role];
    return { email: `${local}@festos.test`, name: staff ? `${staff.name} (${ROLES[role]})` : ROLES[role], role, passwordHash: hash, staffMemberId: staff?.memberId || null };
  });
  await M.User.insertMany(users);

  await M.DataIssue.insertMany(issues);
  log(`[import] ${participants.length} people (${pRows.length} participants + ${contingents.length} escorts), ${registrations.length} registrations, ${issues.length} data issues, ${dupes.length} duplicate candidates`);
  return { participants: participants.length, issues: issues.length, duplicates: dupes.length };
}
