# Events, Venues and Scheduling

These are three independent modules mounted on the existing authenticated `/api` router. The frontend routes are `/events`, `/venues`, and `/scheduling`. Existing legacy endpoints (`POST /api/plans/schedule`, `GET /api/schedule/active`) remain available for compatibility.

## Permissions

- `festival_director`: full access through the existing wildcard permission.
- `events_team`: read/write Events, read/write Venues, read/write Scheduling.
- `logistics_head`: read Events and Venues, write Venues, read Scheduling.
- Other established roles retain Events/Venues read access through the shared read permission set; volunteer retains only the existing limited permissions.
- Every API route also enforces its permission with the existing `requirePerm` middleware. UI actions are additionally hidden for roles without write capability.

## Events API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/events/summary` | Database-backed event counts and published-plan conflicts |
| GET | `/api/events` | Search, filter (`status`, `category`, `department`, `priority`, `from`, `to`), sort, paginate |
| POST | `/api/events` | Create a draft event |
| GET | `/api/events/:id` | Event details, registration count and schedule slots |
| PUT | `/api/events/:id` | Update editable event metadata |
| POST | `/api/events/:id/duplicate` | Create a new draft copy |
| POST | `/api/events/:id/archive` | Archive an event while preserving history |
| PATCH | `/api/events/:id/status` | Submit, review, approve, reject, schedule, ready, start, complete or cancel via valid lifecycle transitions |
| GET | `/api/events/:id/participants` | Registered participant directory, filtered through existing field masking |
| GET | `/api/events/:id/resources` | Compare requested equipment with current available inventory |
| GET | `/api/events/:id/readiness` | Readiness checks for approval, published schedule, operating venue, and required equipment |
| GET | `/api/events/:id/history` | Hash-chained audit entries for the event |

Create body example:

```json
{
  "name": "Robotics Challenge",
  "category": "Competition",
  "department": "Robotics Club",
  "coordinatorName": "Event Coordinator",
  "expectedParticipants": 80,
  "maximumCapacity": 100,
  "priority": "high",
  "durationMinutes": 120,
  "setupMinutes": 30,
  "teardownMinutes": 15,
  "requiredVenueType": "hall",
  "venueRequirements": ["power", "projector"],
  "equipmentNeeds": [{ "item": "Projector", "qty": 1 }]
}
```

Statuses are validated along this lifecycle: `draft → submitted → under_review → approved → scheduled → ready → ongoing → completed`. Rejection can return to draft; cancellation is allowed before completion. Proposals can be approved directly from submitted/review. Event ID and venue ID are generated when omitted.

## Venues API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/venues/summary` | Capacity directory summary, current occupancy, upcoming bookings, conflict flags |
| GET | `/api/venues` | Search/filter venue directory (`q`, `status`, `type`) with pagination |
| POST | `/api/venues` | Register a venue |
| GET | `/api/venues/:id` | Venue profile |
| PUT | `/api/venues/:id` | Update venue details, facilities and operational status |
| DELETE | `/api/venues/:id` | Safely close an unbooked venue; active bookings are protected and records are retained |
| GET | `/api/venues/:id/bookings` | Bookings in the active schedule |
| GET | `/api/venues/:id/availability?from=&to=` | Active schedule bookings, closure windows and operational availability |
| GET | `/api/venues/:id/occupancy` | Current active slot |
| GET | `/api/venues/:id/history` | Hash-chained venue audit entries |

Venue body example:

```json
{
  "name": "Innovation Hall",
  "code": "INNO-HALL",
  "venueType": "hall",
  "building": "Academic Block",
  "capacity": 240,
  "seatingCapacity": 200,
  "indoorOutdoor": "indoor",
  "facilities": ["power", "projector", "wifi", "stage"],
  "setupMinutes": 30,
  "teardownMinutes": 20,
  "operationalStatus": "available"
}
```

## Scheduling API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/schedules` | Schedule plan history |
| GET | `/api/schedules/:id` | Plan and slots |
| POST | `/api/schedules/preview` | Calculate a current-data preview without persistence |
| POST | `/api/schedules/simulate` | Explicit no-write what-if calculation |
| POST | `/api/schedules/auto-generate` | Save a new versioned draft from existing Events, registrations, Venues, inventory and assumptions |
| POST | `/api/schedules/:id/validate` | Check venue availability, windows/closures, capacity and overlapping venue, participant and judge assignments |
| POST | `/api/schedules/:id/publish` | Publish a draft only if blocking checks pass; previous active plan becomes superseded |
| POST | `/api/schedules/:id/rollback` | Restore the preceding published version with a required reason |
| GET | `/api/schedules/conflicts` | Read conflict flags from the active schedule |

The generator is the existing pure schedule engine, which uses registrations to group preliminary heats by arrival, venue feature assumptions, venue windows/closures, capacity assumptions, equipment stock, judges, volunteer pool, participant presence and travel buffers. Its soft shortfalls remain visible as slot reason codes. Publication additionally enforces venue existence/status, capacity, closure, double-booking including setup/teardown, participant overlap and judge overlap.

## Data ownership and integration

- Event and Venue continue using the existing `Event` and `Venue` collections; the schema is extended in place and existing event/venue IDs are retained.
- Registrations and Participant records remain owned by their existing module. Event participant responses pass through the current role-based participant field mask.
- Logistics stock remains the inventory source of truth. Event resource/readiness endpoints query available stock; no new inventory counter is introduced.
- Schedule slots remain attached to existing `Plan` records. The shared command service creates audit entries and emits `events.*`, `venues.*`, and `schedule.*` domain events for audited writes.
- Staff requirements are recorded as event requirements, but this project does not yet have staff shift allocation/availability data integrated into schedule validation. Vendor and accommodation readiness are not currently included in the event readiness calculation.

## Current limitations

- No live database/API workflow was exercised in this change; checks were frontend build, backend unit tests and JavaScript syntax validation.
- The scheduler's scoring engine can return soft shortfalls; publication blocks the current explicit venue, capacity, participant and judge conflicts. It does not yet model staff assignments or equipment reservation windows during validation.
- Later-round slots may remain marked unscheduled until competition results are available. Unscheduled rounds are reported and are not treated as a venue conflict.
- The existing schedule time generation and assumptions remain in force; this module does not replace the scheduling algorithm or invent missing registration data.
