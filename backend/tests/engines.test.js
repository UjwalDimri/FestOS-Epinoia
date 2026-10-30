import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, nightKeys, buildLocations } from '../src/engines/allocation.js';
import { normalizeParticipant, parseEquipment } from '../src/import/normalize.js';
import { scorePair, findDuplicateCandidates } from '../src/import/dedupe.js';
import { dietCoverage } from '../src/engines/food.js';
import { activeFor, resolve } from '../src/constraints/registry.js';
import '../src/constraints/index.js';
import { parseIST } from '../src/utils/time.js';

const A = {
  cleaningBufferHours: 3, externalBudgetINR: 1e9, campusRadiusKm: 1,
  accessibilityRequirementMap: { wheelchair: 'accessible', near_washroom: 'accessible', ground_floor: 'ground_floor', visual_assistance: 'ground_floor' },
  strategyWeights: { balanced: { cost: 1.5, site: 3, group: 0.5, distance: 1, preference: 1 } },
};
const room = (over) => ({ roomId: 'R1', block: 'B1', floor: 1, gender: 'boys', capacity: 1, accessibility: 'no', status: 'available', closures: [], ...over });
const prop = (over) => ({ propertyId: 'EXT1', propertyName: 'Hotel', beds: 5, costPerBedPerNight: 1000, distanceKm: 5, transportAvailability: 'yes', accessibility: 'unknown', status: 'available', closures: [], ...over });
const person = (over) => ({ participantId: 'P1', contingentId: 'C1', personType: 'participant', active: true, quarantined: false,
  accommodationRequested: true, housingCategory: 'male', accessibilityNeeds: { status: 'not_declared', needs: [] }, isMinor: false,
  arrivalDateTime: parseIST('2026-10-31 10:00'), departureDateTime: parseIST('2026-11-01 10:00'), ...over });
const run = (people, rooms, props = [], extra = {}) => allocate({ people, rooms, properties: props, contingents: [], assumptions: A, settings: {}, strategy: 'balanced', ...extra });

test('nightKeys counts nights by 23:00 presence', () => {
  assert.deepEqual(nightKeys(parseIST('2026-10-31 07:00'), parseIST('2026-11-03 07:00')), ['2026-10-31', '2026-11-01', '2026-11-02']);
  assert.equal(nightKeys(parseIST('2026-10-31 10:00'), parseIST('2026-10-31 18:00')).length, 0);
});

test('a bed is never shared by overlapping stays', () => {
  const r = run([person({ participantId: 'A' }), person({ participantId: 'B' })], [room()]);
  const placed = r.allocations.filter((a) => a.status !== 'unplaced');
  assert.equal(placed.length, 1);
  const unplaced = r.allocations.find((a) => a.status === 'unplaced');
  assert.ok(unplaced.reasonCodes.includes('NIGHT_SHORTAGE'));
});

test('allocation respects explicit bed slots and ignores rooms that are not ready', () => {
  const r = room({ capacity: 2, beds: [{ bedId: 'R1-B1', status: 'blocked' }, { bedId: 'R1-B2', status: 'available' }] });
  const result = run([person()], [r]);
  assert.equal(result.allocations[0].bed.bedNo, 2);
  assert.equal(run([person()], [room({ status: 'maintenance' })]).allocations[0].status, 'unplaced');
});

test('closed external properties and uncontracted beds are excluded from allocation', () => {
  assert.equal(run([person({ housingCategory: 'unconfirmed' })], [], [prop({ status: 'closed' })]).allocations[0].status, 'unplaced');
  const capped = run([person({ housingCategory: 'unconfirmed' }), person({ participantId: 'P2', housingCategory: 'unconfirmed' })], [], [prop({ beds: 5, contractedBedCapacity: 1 })]);
  assert.equal(capped.allocations.filter((a) => a.status !== 'unplaced').length, 1);
});

test('cleaning buffer blocks a turnaround that is too quick', () => {
  const a = person({ participantId: 'A', arrivalDateTime: parseIST('2026-10-30 10:00'), departureDateTime: parseIST('2026-10-31 10:00') });
  const tooSoon = person({ participantId: 'B', arrivalDateTime: parseIST('2026-10-31 11:00'), departureDateTime: parseIST('2026-11-01 10:00') });
  const later = person({ participantId: 'C', arrivalDateTime: parseIST('2026-10-31 14:30'), departureDateTime: parseIST('2026-11-01 10:00') });
  const r = run([a, tooSoon], [room()]);
  assert.equal(r.allocations.find((x) => x.participantId === 'B').status, 'unplaced', '11:00 is inside the 3 h buffer');
  const r2 = run([a, later], [room()]);
  assert.notEqual(r2.allocations.find((x) => x.participantId === 'C').status, 'unplaced', '14:30 clears the buffer');
});

test('unconfirmed gender is never placed in a boys or girls block', () => {
  const r = run([person({ housingCategory: 'unconfirmed' })], [room({ gender: 'boys' }), room({ roomId: 'R2', gender: 'girls' })]);
  const a = r.allocations[0];
  assert.equal(a.status, 'unplaced');
  assert.ok(a.reasonCodes.includes('GENDER_UNCONFIRMED'));
});

test('unconfirmed gender may use a verified-private external room', () => {
  const r = run([person({ housingCategory: 'unconfirmed' })], [], [prop({ accessibility: 'yes' })]);
  assert.equal(r.allocations[0].bed.kind, 'external');
  assert.ok(r.allocations[0].reasonCodes.includes('GENDER_UNCONFIRMED_PROVISIONAL'));
});

test('wheelchair needs never land in an unverified external property', () => {
  const p = person({ accessibilityNeeds: { status: 'declared', needs: ['wheelchair'] } });
  const r = run([p], [], [prop({ accessibility: 'unknown' })]);
  assert.equal(r.allocations[0].status, 'unplaced');
  assert.ok(r.allocations[0].reasonCodes.includes('ACCESS_UNVERIFIED'));
});

test('wheelchair needs are placed in an accessible room', () => {
  const p = person({ accessibilityNeeds: { status: 'declared', needs: ['wheelchair'] } });
  const r = run([p], [room({ accessibility: 'yes', gender: 'boys' })]);
  assert.equal(r.allocations[0].status, 'proposed');
  assert.equal(r.allocations[0].bed.roomId, 'R1');
});

test('an explicit "None" accessibility is a declaration, not a need', () => {
  const row = { participant_id: 'P9', name: 'X', college: 'Y', contingent_id: 'C1', gender_as_given: 'Female', age: '20',
    contact: '+91-9999999999', accessibility_needs: 'None', dietary_needs: '', arrival_datetime: '2026-10-31 07:00',
    departure_datetime: '2026-11-03 07:00', accommodation_requested: 'yes', tshirt_size: 'M' };
  const { doc, issues } = normalizeParticipant(row, parseIST('2026-11-01 20:00'));
  assert.equal(doc.accessibilityNeeds.status, 'declared_none');
  assert.equal(doc.dietaryNeeds.status, 'unknown');
  assert.ok(issues.some((i) => i.code === 'DIETARY_NOT_PROVIDED'));
});

test('a blank accessibility field is not treated as declared', () => {
  const row = { participant_id: 'P8', name: 'X', college: 'Y', contingent_id: 'C1', gender_as_given: 'Male', age: '20',
    contact: '+91-9999999999', accessibility_needs: '', dietary_needs: 'Vegetarian', arrival_datetime: '2026-10-31 07:00',
    departure_datetime: '2026-11-03 07:00', accommodation_requested: 'yes', tshirt_size: 'M' };
  assert.equal(normalizeParticipant(row, parseIST('2026-11-01 20:00')).doc.accessibilityNeeds.status, 'not_declared');
});

test('quarantines arrival after departure and arrival after the fest', () => {
  const bad = { participant_id: 'P7', name: 'X', college: 'Y', contingent_id: 'C1', gender_as_given: 'Male', age: '20', contact: '+91-9999999999',
    accessibility_needs: 'None', dietary_needs: 'None', arrival_datetime: '2026-11-02 02:00', departure_datetime: '2026-11-01 02:00', accommodation_requested: 'yes', tshirt_size: 'M' };
  const { doc, issues } = normalizeParticipant(bad, parseIST('2026-11-01 20:00'));
  assert.equal(doc.quarantined, true);
  assert.ok(issues.some((i) => i.code === 'ARRIVAL_AFTER_DEPARTURE'));
  assert.ok(issues.some((i) => i.code === 'ARRIVES_AFTER_FEST'));
});

test('equipment text parses into item quantities', () => {
  assert.deepEqual(parseEquipment('projector; 2 extension cords'), [{ item: 'projector', qty: 1 }, { item: 'extension cord', qty: 2 }]);
  assert.deepEqual(parseEquipment('No special equipment'), []);
});

test('duplicate scoring: same name, different phone and details scores lower than a full match', () => {
  const base = { contingentId: 'C1', name: 'Raghav Joshi', age: 20, gender: 'Male', tshirtSize: 'M', dietaryNeeds: { needs: [] }, accessibilityNeeds: { needs: [] }, arrivalDateTime: parseIST('2026-10-31 07:00'), departureDateTime: parseIST('2026-11-02 07:00') };
  const full = scorePair({ ...base, participantId: 'A' }, { ...base, participantId: 'B' });
  const partial = scorePair({ ...base, participantId: 'A' }, { ...base, age: 25, tshirtSize: 'XL', participantId: 'B' });
  assert.ok(full.score > partial.score);
  assert.ok(full.score >= 80);
});

test('duplicate search never pairs different contingents', () => {
  const p = (id, cid) => ({ participantId: id, contingentId: cid, personType: 'participant', name: 'Same Name', age: 20, gender: 'Male', tshirtSize: 'M', dietaryNeeds: { needs: [] }, accessibilityNeeds: { needs: [] }, arrivalDateTime: parseIST('2026-10-31 07:00'), departureDateTime: parseIST('2026-11-02 07:00') });
  assert.equal(findDuplicateCandidates([p('A', 'C1'), p('B', 'C2')]).length, 0);
});

test('vendor with an expired certificate does not count toward coverage', () => {
  const vendors = [{ vendorId: 'V', name: 'Veg', dietaryTags: ['vegetarian'], certExpiry: parseIST('2026-10-30 23:59'), hours: { open: '07:00', close: '23:00' }, capacity: 500 }];
  const people = [{ participantId: 'P', arrivalDateTime: parseIST('2026-10-29 10:00'), departureDateTime: parseIST('2026-11-03 10:00'), active: true, dietaryNeeds: { status: 'declared', needs: ['vegetarian'] } }];
  const rows = dietCoverage({ vendors, people, days: ['2026-10-30', '2026-11-01'], mealWindows: { breakfast: ['07:30', '09:30'], lunch: ['12:30', '14:30'], dinner: ['19:30', '21:30'] },
    dietServedBy: { vegetarian: ['vegetarian'] } });
  assert.equal(rows.find((r) => r.day === '2026-10-30' && r.meal === 'lunch').covered, true);
  assert.equal(rows.find((r) => r.day === '2026-11-01' && r.meal === 'lunch').covered, false);
});

test('a constraint toggle changes which hard rules run', () => {
  const off = activeFor('accommodation', {}).map((c) => c.id);
  const on = activeFor('accommodation', { ACC_MAX_DISTANCE: { enabled: true, params: { maxKm: 2 } } }).map((c) => c.id);
  assert.equal(off.includes('ACC_MAX_DISTANCE'), false);
  assert.equal(on.includes('ACC_MAX_DISTANCE'), true);
  assert.equal(resolve({ ACC_MAX_DISTANCE: { enabled: true, params: { maxKm: 2 } } }).ACC_MAX_DISTANCE.params.maxKm, 2);
});
