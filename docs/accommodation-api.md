# FestOS Accommodation API

All paths are under `/api`, require the existing bearer token, and use the existing RBAC. `hospitality` and `festival_director` can write accommodation data; read access follows `accommodation:read`. Participant and contingent records stay in their existing collections. Dates are stored as BSON UTC timestamps; API clients should send ISO 8601 timestamps with an offset. Checkout is the end of the occupied interval (exclusive), consistent with the allocator.

## Properties

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/accommodation/properties` | Paginated properties; filters: `propertyType`, `ownership`, `status`, `city`, `q`, `page`, `limit`. |
| GET | `/api/accommodation/properties/:id` | Property details. |
| POST | `/api/accommodation/properties` | Create a property. Supports hostel/hotel/guest house/private hostel types, facilities, accessibility and gender policy, contract dates/capacity, cost model, tax, charges and payment data. |
| PUT | `/api/accommodation/properties/:id` | Update allowlisted property fields. |
| PATCH | `/api/accommodation/properties/:id/status` | Set property `available` or `closed`. |
| GET | `/api/accommodation/properties/:id/rooms` | Rooms associated with property. |
| GET | `/api/accommodation/properties/:id/occupancy` | Physical bed capacity and current or date-specific assigned occupancy. Optional `date` query. |
| GET | `/api/accommodation/properties/:id/cost-summary` | Estimated, actual, paid and outstanding values. |

Example property request:

```json
{
  "propertyId": "HOTEL-01",
  "propertyName": "River View Guest House",
  "propertyType": "guest_house",
  "ownership": "external",
  "city": "Pune",
  "beds": 40,
  "contractedBedCapacity": 32,
  "costModel": "per_bed_per_night",
  "basePrice": 900,
  "taxPercent": 12,
  "additionalCharges": [{ "label": "linen", "amount": 2500 }],
  "accessibility": "yes",
  "genderPolicy": "all_gender"
}
```

## Rooms and bed slots

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/accommodation/rooms` | Paginated room directory. Filters: `propertyId`, `floor`, `roomType`, `status`, `minCapacity`. Response includes derived occupied/available beds. |
| GET | `/api/accommodation/rooms/:id` | Room and bed slots. |
| POST | `/api/accommodation/rooms` | Create room and individual available bed slots from `capacity`. |
| PUT | `/api/accommodation/rooms/:id` | Update room metadata/capacity. Capacity cannot be reduced below active reservations. |
| PATCH | `/api/accommodation/rooms/:id/status` | Update readiness/operations status. Returning a dirty room to ready requires a verified housekeeping task. |
| GET | `/api/accommodation/rooms/:id/occupants` | Current allocations with only operational participant fields. |
| GET | `/api/accommodation/rooms/:id/availability?from=...&to=...` | Per-bed interval availability. `to` is exclusive. |
| GET | `/api/accommodation/rooms/:id/history` | Historical room allocations. |
| GET | `/api/accommodation/rooms/readiness` | Rooms needing cleaning, inspection, maintenance or attention. |

## Allocation

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/accommodation/allocate/preview` | Run the existing deterministic allocator without writing. Body optionally accepts `participantIds`, `contingentIds`, `exclude`, and `strategy`. |
| POST | `/api/accommodation/allocate/commit` | Recalculate and atomically reserve returned beds; does not trust a stale client preview. |
| POST | `/api/accommodation/allocate` | Preview by default; pass `dryRun:false` to commit. |
| POST | `/api/accommodation/reallocate` | Preview recovery/reallocation; review, then submit an approved allocation commit. |
| POST | `/api/accommodation/allocate/manual` | Assign one participant to a specified room/property bed. Requires a reason. |
| GET | `/api/accommodation/allocations` | Paginated history; filters: `participantId`, `contingentId`, `status`. |
| GET | `/api/accommodation/active` | Current active plan metadata and operationally active allocations. |
| GET | `/api/accommodation/allocations/:id` | Allocation by allocation ID or Mongo ID. |
| GET | `/api/accommodation/allocations/report` | Counts and summed recorded costs by status. |
| GET | `/api/accommodation/allocations/:id/history` | Allocation lineage for a participant/move. |
| POST | `/api/accommodation/allocations/:id/move` | Move an active allocation, retaining its previous record. Requires a reason. |
| POST | `/api/accommodation/allocations/:id/cancel` | Cancel active allocation and free its reservation; requires a reason. |
| POST | `/api/accommodation/allocations/:id/override` | Store a documented override reason. |
| GET | `/api/accommodation/unallocated` | Unplaced rows from the active plan. |
| GET | `/api/accommodation/shortages` | Database-driven current run metrics and unallocated people. |
| GET | `/api/accommodation/shortages/daily` | Per-night demand, placed count and capacity. |
| GET | `/api/accommodation/shortages/by-contingent` | Unallocated counts/reasons by contingent. |
| GET | `/api/accommodation/capacity` | Physical and usable campus/external capacity. |
| GET | `/api/accommodation/capacity/forecast` | Daily forecast from current participant dates. |

Reservation updates use a conditional atomic write on the room/property document with a same-bed overlapping-interval guard. On replica-set MongoDB, command writes use the existing transaction wrapper. On standalone MongoDB, the conditional reservation protects against concurrent double booking; multi-document rollback is compensating and can be interrupted by a process crash.

## Check-in, check-out, housekeeping

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/accommodation/check-in` | Validate a current allocation and ready room; accepts `participantId`. `emergencyOverride:true` requires a reason and organizer approval. |
| POST | `/api/accommodation/check-in/bulk` | Check in up to 500 IDs and return per-person exceptions. |
| POST | `/api/accommodation/check-out` | Check out a currently checked-in participant; room cleaning task is created. Accepts `participantId`, optional `early`, `reason`. |
| POST | `/api/accommodation/check-out/bulk` | Check out up to 500 IDs with row-level exceptions. |
| POST | `/api/accommodation/no-show` | Mark a due confirmed/reserved participant as no-show and free the bed. |
| GET | `/api/accommodation/check-in/pending` | Confirmed/reserved arrivals. |
| GET | `/api/accommodation/check-in/completed` | Checked-in records. |
| GET | `/api/accommodation/check-out/pending` | Current checked-in records. |
| GET | `/api/accommodation/check-out/completed` | Checked-out records. |
| GET | `/api/accommodation/exceptions` | Unplaced and no-show records. |
| POST | `/api/accommodation/housekeeping/tasks` | Create task for an existing room. |
| GET | `/api/accommodation/housekeeping/tasks` | Paginated tasks; filters: `roomId`, `propertyId`, `status`, `taskType`, `assignedStaffId`. |
| GET | `/api/accommodation/housekeeping/tasks/:id` | Task detail. |
| PATCH | `/api/accommodation/housekeeping/tasks/:id/assign` | Assign staff. |
| PATCH | `/api/accommodation/housekeeping/tasks/:id/start` | Start task. |
| PATCH | `/api/accommodation/housekeeping/tasks/:id/complete` | Complete cleaning/maintenance; room enters inspection pending. |
| PATCH | `/api/accommodation/housekeeping/tasks/:id/verify` | Verify task and mark room ready. |
| GET | `/api/accommodation/housekeeping/dashboard` | Counts by task and room status. |

## Costs, dashboard and disruptions

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/accommodation/costs/summary` | Estimated/actual totals. |
| GET | `/api/accommodation/costs/properties` | Per-property estimate and actuals. |
| GET | `/api/accommodation/costs/contingents` | Recorded external allocation costs grouped by contingent. |
| GET | `/api/accommodation/costs/daily` | Estimated costs distributed over stay nights. |
| POST | `/api/accommodation/costs/calculate` | Calculate a date range against a property's selected pricing model. |
| GET | `/api/accommodation/dashboard` | Demand, allocation lifecycle, capacity, cleaning, daily shortage and cost summary. |
| POST | `/api/accommodation/simulate-disruption` | Preview room/property closure, capacity reduction, demand increase or accessibility-room loss; no live mutation. |
| GET | `/api/accommodation/disruptions` | Accommodation disruption records. |
| POST | `/api/accommodation/disruptions/:id/approve` | Approve a preview. |
| POST | `/api/accommodation/disruptions/:id/execute` | Apply supported room/property closure or maintenance changes. |

## Storage and integration

The module extends the existing `Room`, `ExternalProperty` and `Allocation` models; no duplicate participant or contingent collection is created. A room contains bed-slot readiness and conditional date-range reservation entries. The `Allocation` collection remains the historical source of allocation transitions. `HousekeepingTask` tracks readiness work; `AccommodationPolicy` is reserved for policy configuration. Event registration remains owned by Events, and participant accommodation needs remain owned by Participants.

Property cost models are `per_bed_per_night`, `per_room_per_night`, `fixed_contract`, and `custom`. Existing allocations are based on bed-night prices; contract/tax/additional charge summaries are estimates. Confirm actual vendor expenditure through the external property's `actualExpenditure` field. Staff IDs are references only; staff management owns staff records.

External contracted inventory is reserved by `propertyId` and bed number. If an external property has informational `Room` records, those are excluded from automatic allocation to avoid double counting its contracted bed inventory; allocate against the property bed inventory. Campus hostels are represented by standalone rooms and their individual bed slots.

## Run and verify

```bash
cd backend
npm install
npm test
npm run dev
```

The backend uses `MONGODB_URI`, `PORT`, `CLIENT_ORIGIN`, `AUTH_MODE`, and the existing JWT/Clerk settings from `backend/.env`. A reachable MongoDB is required. Existing RBAC has no separate warden or housekeeping roles; write endpoints currently use the existing `accommodation:write` permission. Dedicated property-level restrictions and test-database API integration tests remain follow-up work.
