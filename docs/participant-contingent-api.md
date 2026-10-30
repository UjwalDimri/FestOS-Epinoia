# Participant and Contingent API

All routes use `/api`, require the existing bearer-token authentication, and enforce the existing FestOS role permissions. Participant contact and internal notes remain masked/hidden according to existing field masking. Participant and contingent identifiers are their project string IDs (for example `P-1001` and `C-12`), not MongoDB `_id` values.

## Participants

| Method | Endpoint | Permission | Purpose |
|---|---|---|---|
| GET | `/api/participants` | `participants:read` | Search/filter, page and sort the directory. Query: `q`, `contingent`, `college`, `status`, `arrivalFrom`, `arrivalTo`, `departureFrom`, `departureTo`, `dietary`, `accessibility`, `accommodation`, `archived`, `page`, `limit`, `sortBy`, `order`. |
| GET | `/api/participants/:id` | `participants:read` | Existing full profile, registrations and current accommodation allocation. |
| POST | `/api/participants` | `participants:write` | Create a participant with allowlisted schema fields; incomplete records are accepted. |
| PUT | `/api/participants/:id` | `participants:write` | Update allowlisted fields. |
| DELETE | `/api/participants/:id` | `participants:write` | Soft archive (`active=false`). |
| PATCH | `/api/participants/:id/archive` | `participants:write` | Audited soft archive. |
| PATCH | `/api/participants/:id/verify` | `participants:write` | Mark record verified (audited). |
| GET | `/api/participants/:id/events` | `participants:read` | Event registration references only. |
| GET | `/api/participants/:id/accommodation` | `accommodation:read` | Accommodation allocation references. |
| GET | `/api/participants/:id/history` | `dataquality:read` | Audit history for this participant. |
| GET | `/api/participants/duplicates` | `dataquality:read` | Explainable possible duplicate pairs; does not merge records. |
| GET | `/api/participants/incomplete` | `dataquality:read` | Data-quality issues and status for incomplete records. |
| POST | `/api/participants/import/preview` | `participants:write` | Parse and validate a CSV into a reviewable import batch. |
| POST | `/api/participants/import/:batchId/confirm` | `participants:write` | Commit ready rows once; subsequent confirmation is idempotent. Supports `type: "participant"` or `"contingent"` in preview. |

Participant create example:

```http
POST /api/participants
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "participantId": "P-1001",
  "name": "Asha Rao",
  "college": "Example College",
  "contingentId": "C-12",
  "gender": "female",
  "age": 20,
  "contact": "+91-9000000000",
  "accessibilityNeeds": { "status": "not_declared", "needs": [] },
  "dietaryNeeds": { "status": "unknown", "needs": [] },
  "arrivalDateTime": "2026-11-20T09:00:00+05:30",
  "departureDateTime": "2026-11-23T17:00:00+05:30",
  "accommodationRequested": true,
  "tshirtSize": "M"
}
```

Directory response includes `rows` and `total`, `page`, `pageSize`, `totalPages`, `hasNextPage`, and `hasPreviousPage`.

CSV preview example:

```json
{
  "type": "participant",
  "csv": "id,full_name,college,contingent\nP-1001,Asha Rao,Example College,C-12",
  "mapping": { "id": "participantId", "full_name": "name", "college": "college", "contingent": "contingentId" }
}
```

Preview preserves every source row and reports row numbers, mapped values, and validation errors. Confirmation will reject conflicting IDs/emails and never overwrite existing records.

## Contingents

| Method | Endpoint | Permission | Purpose |
|---|---|---|---|
| GET | `/api/contingents` | `contingents:read` | Paginated list/search; actual participant counts are computed from participant records. |
| GET | `/api/contingents/:id` | `contingents:read` | Contingent details and paginated participant list. |
| POST | `/api/contingents` | `contingents:write` | Create contingent. Supports `college`, `collegeCode`, `leader`, `escort`, `strengthDeclared`, and `preferences`. |
| PUT | `/api/contingents/:id` | `contingents:write` | Update allowlisted contingent fields. |
| DELETE | `/api/contingents/:id` | `contingents:write` | Mark cancelled; refused while active participants remain. |
| GET | `/api/contingents/:id/participants` | `contingents:read` | Paginated contingent membership. |
| GET | `/api/contingents/:id/summary` | `contingents:read` | Expected/actual/arrived/accommodation counts and verification status totals. |
| PATCH | `/api/contingents/:id/status` | `contingents:write` | Set operational status: `expected`, `confirmed`, `arrived`, `partially_arrived`, `departed`, or `cancelled`. |

Create contingent example:

```json
{
  "contingentId": "C-12",
  "college": "Example College",
  "collegeCode": "EXC-01",
  "leader": "Asha Rao",
  "escort": "Mira Sen",
  "strengthDeclared": 24,
  "preferences": ["near_venue"]
}
```

## Errors and integration notes

Errors use the existing `{ "error": "...", "details": ... }` format. Invalid input returns 400, missing records 404, permission failures 403, and unique conflicts 409. Event registrations remain owned by the Events model; accommodation allocations remain owned by Accommodation. Participant references connect those modules without duplicating their operational state.

New participant fields follow Team 1's agreed form: participant ID, name, college, contingent ID, gender, age, contact, accessibility needs, dietary needs, arrival/departure date-time, accommodation requirement and T-shirt size. Contingents retain the agreed college, contingent number/ID, leader, escort, declared strength and preferences fields, with operational metadata added around them.
