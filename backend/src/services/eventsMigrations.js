import { Event, Venue } from '../models/index.js';

// Give pre-module records safe lifecycle defaults without replacing IDs or existing fields.
export async function migrateEventVenueModule() {
  const [events, venues] = await Promise.all([
    Event.updateMany({ status: { $exists: false } }, { $set: { status: 'approved', priority: 'normal', durationMinutes: 60, expectedParticipants: 0 } }),
    Venue.updateMany({ operationalStatus: { $exists: false } }, { $set: { operationalStatus: 'available' } }),
  ]);
  return { eventDefaultsApplied: events.modifiedCount, venueDefaultsApplied: venues.modifiedCount };
}
