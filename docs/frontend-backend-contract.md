# Frontend ↔ backend contract (Person B)

Paths are relative to `VITE_API_BASE_URL` (default `/api`), with Bearer authentication after login. JSON errors use `{error,details}`. Response shapes below were checked in `backend/src/routes/api.js`; role permissions are enforced by the backend.

## Auth, dashboard, participants and data quality

| Method/path | Query or body | Actual response | Permission | Exists / mode |
|---|---|---|---|---|
| POST `/auth/login` | `{email,password}` | `{token,user:{...,roleLabel}}` | public | yes / real |
| GET `/me` | — | `{user:{...,roleLabel},permissions:string[]}` | authenticated | yes / real |
| GET `/dashboard` | — | `{counts,alerts,accommodation,schedule,merchShort}`; plan values may be null | authenticated | yes / real or explicit fixture |
| GET `/alerts` | — | `{alerts:[...]}` | authenticated | yes / real |
| POST `/alerts/:key/ack` | — | `{alert}` | `alerts:ack` | yes / real |
| GET `/participants` | `q,flag,contingent,housing,page,limit` | `{total,page,limit,rows:[masked participant]}`; limit capped at 200 | `participants:read` | yes / real or explicit list fixture |
| GET `/participants/:id` | — | `{person,allocation,registrations,merch,duplicateCandidates}` | `participants:read` | yes / real |
| POST `/participants/:id/reveal` | `{field,reason}` | `{participantId,field,value}` | field/role checked | yes / real |
| POST `/participants/:id/housing` | housing fields and reason | audited command result | `participants:write` | yes / real |
| GET `/data/issues` | `severity`, `status` | `{issues:[...]}` (up to 500; default status `open`) | `dataquality:read` | yes / real or explicit fixture |
| GET `/data/headcount` | — | headcount values and `{ladder:[...]}` | `dataquality:read` | yes / real or explicit fixture |
| GET `/data/duplicates` | — | `{candidates:[...]}` (up to 200 open) | `dataquality:read` | yes / real or explicit fixture |
| POST `/data/duplicates/:id/dismiss` | `{reason}` | audited command result | `dataquality:write` | yes / real |
| POST `/data/issues/:id/resolve` | `{accept,reason}` | audited command result | `dataquality:write` | yes / real |

## Plans and schedule

| Method/path | Query or body | Actual response | Permission | Exists / mode |
|---|---|---|---|---|
| GET `/plans` | — | `{plans:[...]}` | authenticated | yes / real |
| POST `/plans/accommodation` | `{strategy,budgetMode?}` | planner result, including plan id and metrics | `accommodation:write` (Director, Hospitality) | yes / real |
| POST `/plans/schedule` | — | planner result, including plan id and metrics | `schedule:write` (Director, Events Team) | yes / real |
| POST `/plans/:planId/activate` | `{reason}` | audited activation result | `accommodation:write` | yes / real |
| GET `/accommodation/compare` | — | `{strategies,note}`; strategy metrics include placed, unplaced, cost, splits and budget status | `accommodation:read` | yes / real |
| GET `/accommodation/active` | — | `{plan:null,allocations:[]}` or `{plan:{planId,strategy,metrics,status},allocations}` | `accommodation:read` | yes / real |
| GET `/accommodation/unplaced` | — | `{rows:[...]}` | `accommodation:read` | yes / real; detail view pending |
| GET `/rooms` | — | `{rooms:[...]}` | `accommodation:read` | yes / real; detail view pending |
| GET `/schedule/active` | — | `{plan:null,slots:[]}` or `{plan:{planId,metrics},slots,venues:[{venueId,name,capacity,indoorOutdoor}]}` | `schedule:read` | yes / real, read-only |
| GET `/events` | — | — | — | **PROPOSED, BACKEND IMPLEMENTATION REQUIRED** |
| GET `/venues` | — | — | — | **PROPOSED, BACKEND IMPLEMENTATION REQUIRED**; venues currently embedded in schedule response |
| Event/venue create or edit routes | — | — | — | **PROPOSED, BACKEND IMPLEMENTATION REQUIRED** |

## Disruptions

| Method/path | Query or body | Actual response | Permission | Exists / mode |
|---|---|---|---|---|
| GET `/disruptions` | — | `{types:string[],recent:[...]}` | authenticated | yes / real or stable fixture |
| POST `/disruptions/preview` | `{type,params}` | preview with `disruptionId,type,risk,summary,committers` and explanation; summary varies by type | `disruptions:preview` | yes / real |
| POST `/disruptions/:id/commit` | `{reason}` | commit result; duplicate merch may report `blocked:true` | backend committer rules | yes / real |

Supported types from the backend: `hostel_closure`, `late_contingent`, `duplicate_record`, `equipment_failure`, `venue_change`, `vendor_shutdown`, `duplicate_merch_claim`, `constraint_change`. Frontend must use this returned list and invalidate a preview if inputs change. It does not approve changes or infer allocation safety.

## Logistics, audit and exports

| Method/path | Query or body | Actual response | Permission | Exists / mode |
|---|---|---|---|---|
| GET `/inventory` | — | `{balances,lines,movements}` | `inventory:read` | yes / real; read-only page pending |
| POST `/inventory/move` | `{item,from,to,qty,reason}` | audited command result | `inventory:write` | yes / real |
| GET `/merch` | — | `{forecast,issuesToday}` | `merch:read` | yes / real; read-only page pending |
| GET `/vendors` | — | `{vendors,incidents}` | `vendors:read` | yes / real; read-only page pending |
| GET `/vendors/coverage` | — | food coverage result plus `{days,meals}` | `vendors:read` | yes / real; read-only page pending |
| GET `/audit` | `limit` (default 100, max 500); no filters | `{rows:[...]}` | `dashboard:read` currently | yes / real or explicit fixture |
| GET `/audit/verify` | — | direct `verifyAuditChain()` result (`ok`, `checked`, optionally `brokenAtSeq`) | `dashboard:read` currently | yes / real |
| GET `/export/:kind.csv` | kind `accommodation`, `schedule`, `inventory` | CSV file | `exports:read` (Director, Hospitality, Events Team, Logistics Head) | yes / real |
| GET `/constraints` | — | `{constraints:[...]}` | `constraints:read` | yes / real |
| GET `/assumptions` | — | `{assumptions:[...]}` | `assumptions:read` | yes / real |
| PUT `/assumptions/:key` | `{value,reason}` | audited result | `override:high` | yes / real |

## Requests for Person A

- Fix disruption committer mapping key `constraint_replan` to `constraint_change` (confirmed in `backend/src/shared/roles.js`).
- Add `GET /events` and `GET /venues` for standalone read views; event/venue edit routes are also proposed.
- Restrict `/audit` and `/audit/verify` by role; current permission is `dashboard:read`, which includes Volunteer per the handoff.
- Return 401 on invalid login (currently reported as 400).
- Add a dashboard freshness timestamp and audit filters/pagination if needed.
- Bind disruption commit to the previewed state/version to reject stale previews.
- Publish stable response schemas for planner and disruption results, which currently vary by scenario.
