import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrivalAfterDelay, assertDisruptionTransactionsSupported, validateDisruptionParams } from '../src/services/disruptionValidation.js';
import { DISRUPTION_COMMITTERS, can } from '../src/shared/roles.js';

test('late arrival keeps members whose existing arrival is later than the delay', () => {
  const delay = new Date('2026-10-31T12:30:00+05:30');
  assert.equal(arrivalAfterDelay('2026-10-31T08:00:00+05:30', delay).toISOString(), delay.toISOString());
  assert.equal(arrivalAfterDelay('2026-10-31T16:00:00+05:30', delay).toISOString(), '2026-10-31T10:30:00.000Z');
});

test('all eight disruption types accept their documented parameter shapes', () => {
  const cases = [
    ['hostel_closure', { roomId: 'R1', from: '2026-10-31 10:00', to: '2026-10-31 11:00' }],
    ['late_contingent', { contingentId: 'C1', newArrival: '2026-10-31 10:00' }],
    ['duplicate_record', { keepId: 'P1', dropId: 'P2' }],
    ['equipment_failure', { item: 'projector', qty: 1 }],
    ['venue_change', { venueId: 'V1' }],
    ['vendor_shutdown', { vendorId: 'V1' }],
    ['duplicate_merch_claim', { participantId: 'P1', item: 'T-shirt' }],
    ['constraint_change', { constraintId: 'ACC_MAX_DISTANCE', enabled: true, params: { maxKm: 1 } }],
  ];
  for (const [type, params] of cases) assert.equal(validateDisruptionParams(type, params), params);
});

test('disruption validation rejects missing, malformed, and contradictory parameters', () => {
  assert.throws(() => validateDisruptionParams('hostel_closure', {}), /exactly one/);
  assert.throws(() => validateDisruptionParams('late_contingent', { contingentId: 'C1', newArrival: 'tomorrow' }), /YYYY-MM-DD/);
  assert.throws(() => validateDisruptionParams('duplicate_record', { keepId: 'P1', dropId: 'P1' }), /different records/);
  assert.throws(() => validateDisruptionParams('equipment_failure', { item: 'projector', qty: 0 }), /positive integer/);
  assert.throws(() => validateDisruptionParams('venue_change', { venueId: 'V1', from: '2026-10-31 11:00', to: '2026-10-31 10:00' }), /earlier/);
  assert.throws(() => validateDisruptionParams('constraint_change', { constraintId: 'NOT_REAL', enabled: true }), /Unknown constraint/);
  assert.throws(() => validateDisruptionParams('constraint_change', { constraintId: 'ACC_MAX_DISTANCE', enabled: true, params: { maxKm: -1 } }), /non-negative/);
});

test('events and hospitality roles can commit the implemented constraint_change type', () => {
  for (const role of ['events_team', 'hospitality']) {
    assert.ok(DISRUPTION_COMMITTERS.constraint_change.includes(role));
    assert.ok(can(role, 'disruptions:commit'));
  }
});

test('disruption commits refuse to run without transaction support', () => {
  assert.throws(() => assertDisruptionTransactionsSupported(false), { status: 409 });
  assert.doesNotThrow(() => assertDisruptionTransactionsSupported(true));
});

test('integration database URI guard accepts only festos_test', async () => {
  const { assertIsolatedTestDbUri } = await import('../src/services/disruptionTestDbGuard.js');
  assert.equal(assertIsolatedTestDbUri('mongodb://127.0.0.1:27019/festos_test?replicaSet=rs0'), 'festos_test');
  assert.throws(() => assertIsolatedTestDbUri('mongodb://127.0.0.1:27018/festos_demo?replicaSet=rs0'), /must use database "festos_test"/);
  assert.throws(() => assertIsolatedTestDbUri('mongodb://127.0.0.1:27018/?replicaSet=rs0'), /must use database "festos_test"/);
});
