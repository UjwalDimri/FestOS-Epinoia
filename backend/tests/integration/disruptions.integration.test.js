import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import * as M from '../../src/models/index.js';
import { connectDb, disconnectDb, supportsTransactions } from '../../src/config/db.js';
import { ensureAssumptions, invalidateAssumptions } from '../../src/services/assumptions.js';
import { previewDisruption, commitDisruption } from '../../src/services/disruptions.js';
import { verifyAuditChain } from '../../src/services/command.js';
import { assertIsolatedTestDbUri } from '../../src/services/disruptionTestDbGuard.js';
import { parseIST } from '../../src/utils/time.js';

const uri = process.env.MONGODB_TEST_URI;
assertIsolatedTestDbUri(uri);

const at = (value) => parseIST(value);
const actor = (role = 'festival_director') => ({ userId: `test-${role}`, email: `${role}@festos.test`, role });
const committedModels = Object.values(M).filter((model) => model.modelName !== 'Disruption');

async function snapshotCommittedState() {
  const snapshots = await Promise.all(committedModels.map(async (model) => [model.modelName, await model.find({}).sort({ _id: 1 }).lean()]));
  return JSON.stringify(snapshots);
}

async function seedFixture() {
  // This cleanup is restricted to collections in the URI-guarded festos_test database.
  for (const model of Object.values(M)) await model.deleteMany({});
  invalidateAssumptions();
  await ensureAssumptions();

  await M.Contingent.create({ contingentId: 'C1', college: 'Test College', strengthDeclared: 4 });
  const people = [
    { participantId: 'P1', name: 'Earlier arrival', arrival: at('2026-10-30 08:00') },
    { participantId: 'P2', name: 'Later arrival', arrival: at('2026-10-30 18:00') },
    { participantId: 'P3', name: 'Keep duplicate', arrival: at('2026-10-30 09:00') },
    { participantId: 'P4', name: 'Drop duplicate', arrival: at('2026-10-30 10:00') },
  ].map((p) => ({
    ...p, contingentId: 'C1', college: 'Test College', personType: 'participant', active: true,
    housingCategory: 'male', arrival: p.arrival, departure: at('2026-11-01 20:00'),
    accommodationRequested: true, isMinor: false, quarantined: false,
    accessibility: { status: 'declared_none', needs: [] }, dietary: { status: 'unknown', needs: [] },
  }));
  await M.Participant.create(people);
  await M.Room.create({ roomId: 'R1', block: 'B1', floor: 0, pool: 'boys', capacity: 10, accessible: 'yes', status: 'available', closures: [] });
  await M.Plan.create([
    { planId: 'ACC-TEST', type: 'accommodation', status: 'active', strategy: 'balanced', metrics: {} },
    { planId: 'SCH-TEST', type: 'schedule', status: 'active', strategy: 'test', metrics: {} },
  ]);
  await M.Allocation.create(people.map((p, index) => ({
    planId: 'ACC-TEST', participantId: p.participantId, contingentId: 'C1', personType: 'participant',
    bed: { kind: 'hostel', roomId: 'R1', bedNo: index + 1, site: 'campus', group: 'B1' },
    checkIn: p.arrival, checkOut: p.departure, nights: 2, cost: 0, status: 'confirmed', reasonCodes: [],
  })));

  await M.Venue.create({
    venueId: 'V1', name: 'Test Hall', capacity: 50, indoorOutdoor: 'indoor', closures: [],
    windows: [{ start: at('2026-10-30 08:00'), end: at('2026-11-01 20:00') }],
  });
  await M.Event.create({ eventId: 'E1', name: 'Test Event', type: 'solo', rounds: ['prelims'], durationMinutes: 30,
    venueRequirements: [], equipmentNeeds: [{ item: 'projector', qty: 2 }], volunteersNeeded: 1, judgeIds: [] });
  await M.Registration.create(people.map((p) => ({ participantId: p.participantId, eventId: 'E1', active: true })));
  await M.Slot.create({ planId: 'SCH-TEST', slotId: 'E1-R1-H1', eventId: 'E1', round: 'prelims', heat: 1,
    venueId: 'V1', start: at('2026-10-30 12:00'), end: at('2026-10-30 12:30'), participantIds: ['P1', 'P2', 'P3', 'P4'], status: 'scheduled' });

  await M.StockBalance.create({ item: 'projector', location: 'Hall', state: 'available', qty: 2 });
  await M.Vendor.create({ vendorId: 'VND1', name: 'Test Vendor', menu: 'Meals', dietaryTags: ['*'],
    certExpiry: at('2026-11-01 23:59'), hours: { open: '07:00', close: '23:00' }, capacity: 500 });
  await M.MerchIssue.create({ participantId: 'P4', item: 'T-shirt', size: 'M', kind: 'original', desk: 'test', issuedBy: 'seed-test', issuedByRole: 'merchandise_desk' });
}

before(async () => {
  await connectDb(uri);
  if (!supportsTransactions()) throw new Error('MONGODB_TEST_URI must connect to a replica set with transaction support');
  await Promise.all(Object.values(M).map((model) => model.init()));
});

beforeEach(seedFixture);
after(async () => {
  try {
    if (mongoose.connection.readyState === 1 && assertIsolatedTestDbUri(uri) === 'festos_test') {
      for (const model of Object.values(M)) await model.deleteMany({});
    }
  } finally {
    await disconnectDb();
  }
});

test('all eight previews leave committed collections unchanged and report supported impacts', async () => {
  const scenarios = [
    ['hostel_closure', { roomId: 'R1', from: '2026-10-30 11:00', to: '2026-10-30 14:00' }, ['displaced', 'unplaced', 'costDeltaINR']],
    ['late_contingent', { contingentId: 'C1', newArrival: '2026-10-30 11:00' }, ['slotsAffected', 'scheduleAfter']],
    ['duplicate_record', { keepId: 'P3', dropId: 'P4' }, ['registrationsMoved', 'merchAlreadyIssuedToDrop']],
    ['equipment_failure', { item: 'projector', qty: 1 }, ['equipmentShortBefore', 'equipmentShortAfter']],
    ['venue_change', { venueId: 'V1', from: '2026-10-30 11:00', to: '2026-10-30 14:00' }, ['before', 'after']],
    ['vendor_shutdown', { vendorId: 'VND1', from: '2026-10-30 10:00', to: '2026-10-30 13:00' }, ['before', 'after']],
    ['duplicate_merch_claim', { participantId: 'P4', item: 'T-shirt' }, ['allowed', 'original']],
    ['constraint_change', { constraintId: 'ACC_MAX_DISTANCE', enabled: true, params: { maxKm: 1 } }, ['before', 'after']],
  ];
  for (const [type, params, impactFields] of scenarios) {
    const beforeSnapshot = await snapshotCommittedState();
    const preview = await previewDisruption(type, params, actor('festival_director'));
    assert.equal(await snapshotCommittedState(), beforeSnapshot, `${type} preview changed committed collections`);
    for (const field of impactFields) assert.ok(field in preview.summary, `${type} summary omitted ${field}`);
    if (type === 'hostel_closure') assert.equal(preview.summary.displaced, 3);
  }
});

test('hostel closure commit persists closure, releases affected allocations, and audits the actor', async () => {
  const preview = await previewDisruption('hostel_closure', { roomId: 'R1', from: '2026-10-30 11:00', to: '2026-10-30 14:00' }, actor('hospitality'));
  await commitDisruption(preview.disruptionId, actor('hospitality'), 'Pipe burst in room block');
  assert.equal((await M.Room.findOne({ roomId: 'R1' }).lean()).closures.length, 1);
  assert.equal(await M.Allocation.countDocuments({ planId: 'ACC-TEST', status: 'released' }), 3);
  const log = await M.AuditLog.findOne({ disruptionId: preview.disruptionId }).lean();
  assert.equal(log.actor.role, 'hospitality');
  assert.equal(log.reason, 'Pipe burst in room block');
  assert.equal(log.action, 'DISRUPTION_HOSTEL_CLOSURE');
  assert.equal(log.summary.displaced, 3);
});

test('late contingent revalidates newer arrival data and retries return the original result', async () => {
  const preview = await previewDisruption('late_contingent', { contingentId: 'C1', newArrival: '2026-10-30 11:00' }, actor('events_team'));
  await M.Participant.updateOne({ participantId: 'P2' }, { arrival: at('2026-10-30 19:00') });
  const firstResult = await commitDisruption(preview.disruptionId, actor('events_team'), 'Bus delayed on route');
  assert.equal((await M.Participant.findOne({ participantId: 'P1' }).lean()).arrival.toISOString(), at('2026-10-30 11:00').toISOString());
  assert.equal((await M.Participant.findOne({ participantId: 'P2' }).lean()).arrival.toISOString(), at('2026-10-30 19:00').toISOString());
  const allocations = await M.Allocation.countDocuments({ planId: 'ACC-TEST' });
  const audits = await M.AuditLog.countDocuments({ disruptionId: preview.disruptionId });
  const retryResult = await commitDisruption(preview.disruptionId, actor('events_team'), 'Bus delayed on route');
  assert.deepEqual(retryResult, firstResult);
  assert.equal(await M.Allocation.countDocuments({ planId: 'ACC-TEST' }), allocations);
  assert.equal(await M.AuditLog.countDocuments({ disruptionId: preview.disruptionId }), audits);
});

test('concurrent duplicate commits produce one change and one audit record', async () => {
  const preview = await previewDisruption('constraint_change', { constraintId: 'ACC_MAX_DISTANCE', enabled: true }, actor('hospitality'));
  const reason = 'Safety radius changed concurrently';
  const [first, second] = await Promise.all([
    commitDisruption(preview.disruptionId, actor('hospitality'), reason),
    commitDisruption(preview.disruptionId, actor('hospitality'), reason),
  ]);
  assert.deepEqual(second, first);
  assert.equal(await M.ConstraintSetting.countDocuments({ constraintId: 'ACC_MAX_DISTANCE' }), 1);
  assert.equal(await M.AuditLog.countDocuments({ disruptionId: preview.disruptionId }), 1);
});

test('duplicate record commit deactivates the duplicate and deduplicates registration', async () => {
  const preview = await previewDisruption('duplicate_record', { keepId: 'P3', dropId: 'P1' }, actor('registration_desk'));
  await commitDisruption(preview.disruptionId, actor('registration_desk'), 'Confirmed duplicate at registration');
  const dropped = await M.Participant.findOne({ participantId: 'P1' }).lean();
  assert.equal(dropped.active, false);
  assert.equal(dropped.mergedInto, 'P3');
  assert.equal(await M.Registration.countDocuments({ participantId: 'P1' }), 0);
  assert.equal(await M.Registration.countDocuments({ participantId: 'P3', eventId: 'E1' }), 1);
});

test('duplicate merge with prior merch is high risk and requires Director approval', async () => {
  const preview = await previewDisruption('duplicate_record', { keepId: 'P3', dropId: 'P4' }, actor('registration_desk'));
  assert.equal(preview.risk, 'high');
  await assert.rejects(commitDisruption(preview.disruptionId, actor('registration_desk'), 'Confirmed duplicate record'), { status: 403 });
  await commitDisruption(preview.disruptionId, actor('festival_director'), 'Director approved merch reconciliation');
  assert.equal((await M.Participant.findOne({ participantId: 'P4' }).lean()).mergedInto, 'P3');
});

test('equipment failure moves stock and activates a replanned schedule', async () => {
  const preview = await previewDisruption('equipment_failure', { item: 'projector', qty: 1 }, actor('logistics_head'));
  assert.ok(preview.summary.equipmentShortAfter > preview.summary.equipmentShortBefore);
  const result = await commitDisruption(preview.disruptionId, actor('logistics_head'), 'Projector lamp failed');
  assert.ok(result.replannedSchedule);
  assert.equal((await M.StockBalance.findOne({ item: 'projector', state: 'available' }).lean()).qty, 1);
  assert.equal((await M.StockBalance.findOne({ item: 'projector', state: 'damaged' }).lean()).qty, 1);
  assert.equal(await M.StockMovement.countDocuments({ item: 'projector' }), 1);
  assert.equal(await M.AuditLog.countDocuments({ action: 'PLAN_ACTIVATE', 'entity.id': result.replannedSchedule }), 1);
});

test('venue change persists closure and creates a schedule plan', async () => {
  const preview = await previewDisruption('venue_change', { venueId: 'V1', from: '2026-10-30 11:00', to: '2026-10-30 14:00' }, actor('events_team'));
  assert.equal(preview.summary.slotsInVenueWindow, 1);
  const result = await commitDisruption(preview.disruptionId, actor('events_team'), 'Hall closed for repair');
  assert.ok(result.replannedSchedule);
  assert.equal((await M.Venue.findOne({ venueId: 'V1' }).lean()).closures.length, 1);
  assert.equal(await M.Plan.countDocuments({ type: 'schedule', status: 'active' }), 1);
  assert.equal(await M.AuditLog.countDocuments({ action: 'PLAN_ACTIVATE', 'entity.id': result.replannedSchedule }), 1);
});

test('schedule replan failure rolls back the disruption, generated plan, and audit', async () => {
  const preview = await previewDisruption('venue_change', { venueId: 'V1', from: '2026-10-30 11:00', to: '2026-10-30 14:00' }, actor('events_team'));
  const stateBefore = await snapshotCommittedState();
  const insertMany = M.Slot.insertMany;
  M.Slot.insertMany = function (...args) { return Promise.reject(new Error('Injected schedule insert failure')); };
  try {
    await assert.rejects(commitDisruption(preview.disruptionId, actor('events_team'), 'Hall closed for repair'), /Injected schedule insert failure/);
  } finally {
    M.Slot.insertMany = insertMany;
  }
  assert.equal(await snapshotCommittedState(), stateBefore);
  assert.equal((await M.Disruption.findOne({ disruptionId: preview.disruptionId }).lean()).status, 'previewed');
});

test('vendor shutdown persists an incident and audit hash chain verifies', async () => {
  const preview = await previewDisruption('vendor_shutdown', { vendorId: 'VND1', from: '2026-10-30 10:00', to: '2026-10-30 13:00' }, actor('food_coordinator'));
  assert.ok(preview.summary.before);
  assert.ok(preview.summary.after);
  await commitDisruption(preview.disruptionId, actor('food_coordinator'), 'Vendor reported power outage');
  assert.equal(await M.VendorIncident.countDocuments({ vendorId: 'VND1' }), 1);
  assert.equal((await verifyAuditChain()).ok, true);
});

test('duplicate merch claim reports the original issue without issuing a second one', async () => {
  const preview = await previewDisruption('duplicate_merch_claim', { participantId: 'P4', item: 'T-shirt' }, actor('merchandise_desk'));
  const result = await commitDisruption(preview.disruptionId, actor('merchandise_desk'), 'Participant requested another shirt');
  const retry = await commitDisruption(preview.disruptionId, actor('merchandise_desk'), 'Participant requested another shirt');
  assert.equal(result.blocked, true);
  assert.deepEqual(retry, result);
  assert.equal(await M.MerchIssue.countDocuments({ participantId: 'P4', item: 'T-shirt', kind: 'original' }), 1);
  assert.equal((await M.Disruption.findOne({ disruptionId: preview.disruptionId }).lean()).status, 'committed');
});

test('constraint change persists when commit succeeds and leaves no state after injected failure', async () => {
  const preview = await previewDisruption('constraint_change', { constraintId: 'ACC_MAX_DISTANCE', enabled: true, params: { maxKm: 1 } }, actor('hospitality'));
  await commitDisruption(preview.disruptionId, actor('hospitality'), 'Safety radius changed');
  const setting = await M.ConstraintSetting.findOne({ constraintId: 'ACC_MAX_DISTANCE' }).lean();
  assert.equal(setting.enabled, true);
  assert.equal(setting.params.maxKm, 1);

  const failedPreview = await previewDisruption('constraint_change', { constraintId: 'ACC_MAX_DISTANCE', enabled: false }, actor('hospitality'));
  const auditBefore = await M.AuditLog.countDocuments({ disruptionId: failedPreview.disruptionId });
  const save = M.Disruption.prototype.save;
  M.Disruption.prototype.save = function (...args) {
    if (this.disruptionId === failedPreview.disruptionId && this.status === 'committed') return Promise.reject(new Error('Injected disruption save failure'));
    return save.apply(this, args);
  };
  try {
    await assert.rejects(commitDisruption(failedPreview.disruptionId, actor('hospitality'), 'Disable for rollback check'), /Injected disruption save failure/);
  } finally {
    M.Disruption.prototype.save = save;
  }
  const afterFailure = await M.ConstraintSetting.findOne({ constraintId: 'ACC_MAX_DISTANCE' }).lean();
  assert.equal(afterFailure.enabled, true);
  assert.equal(await M.AuditLog.countDocuments({ disruptionId: failedPreview.disruptionId }), auditBefore);
  assert.equal((await M.Disruption.findOne({ disruptionId: failedPreview.disruptionId }).lean()).status, 'previewed');
});

test('forbidden commit role is rejected without changing committed data', async () => {
  const preview = await previewDisruption('constraint_change', { constraintId: 'ACC_MAX_DISTANCE', enabled: true }, actor('festival_director'));
  const stateBefore = await snapshotCommittedState();
  await assert.rejects(commitDisruption(preview.disruptionId, actor('volunteer'), 'Try forbidden change'), { status: 403 });
  assert.equal(await snapshotCommittedState(), stateBefore);
});
