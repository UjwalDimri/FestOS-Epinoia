import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSchedule } from '../src/engines/schedule.js';

test('team event prelim heats keep each registered team in one heat', () => {
  const people = ['P1', 'P2', 'P3'].map((participantId) => ({
    participantId,
    arrivalDateTime: new Date('2026-10-30T05:00:00.000Z'),
    departureDateTime: new Date('2026-10-30T18:00:00.000Z'),
  }));
  const result = generateSchedule({
    events: [{ eventId: 'E1', type: 'team', rounds: ['prelims'], durationMinutes: 60, venueRequirements: [], equipmentNeeds: [], volunteersNeeded: 0 }],
    venues: [{ venueId: 'V1', capacity: 3, indoorOutdoor: 'indoor', windows: [{ start: new Date('2026-10-30T02:00:00.000Z'), end: new Date('2026-10-30T16:00:00.000Z') }], closures: [] }],
    participants: people,
    registrations: [
      { eventId: 'E1', participantId: 'P1', teamId: 'T1', active: true },
      { eventId: 'E1', participantId: 'P2', teamId: 'T1', active: true },
      { eventId: 'E1', participantId: 'P3', teamId: null, active: true },
    ],
    stock: [],
    assumptions: { capacityFactor: 1, venueFeatures: {}, setupMinutes: 0, teardownMinutes: 0, travelBufferMinutes: 0, arrivalReadyMinutes: 0, maxHeatSize: 2, minPrelimHeats: 2, volunteerPool: 2 },
  });
  const teamSlots = result.slots.filter((slot) => slot.participantIds.includes('P1') || slot.participantIds.includes('P2'));
  assert.equal(teamSlots.length, 1);
  assert.deepEqual(teamSlots[0].participantIds, ['P1', 'P2']);
  assert.deepEqual(teamSlots[0].teamIds, ['T1']);
});
