# Backend API contracts

P1 disruption contracts inspected for Stage P1. These routes are mounted under `/api` and require an authenticated bearer token. The existing frontend calls these routes through `frontend/src/api.js`; this stage does not change endpoint names or response envelopes.

## Disruptions

| Method and path | Required role | Request | Success | Error codes |
|---|---|---|---|---|
| `GET /api/disruptions` | Any authenticated role | None | `200 { types: string[], recent: Disruption[] }` (latest 30) | `401`, `500` |
| `POST /api/disruptions/preview` | Role with `disruptions:preview` | `{ type, params }` | `200 { disruptionId, type, risk, summary, committers, explanation }` | `400` invalid type/params; `401`; `403`; `404` missing referenced entity; `500` |
| `POST /api/disruptions/:id/commit` | Director, or the type-specific role below | `{ reason: string }` (at least 5 trimmed characters) | `200 { committed, summary }`; venue/equipment may also include `replannedSchedule`; duplicate merch returns its existing rejection result | `400` stale/already committed or invalid reason; `401`; `403`; `404`; `409` duplicate-key conflicts; `500` |

### Preview parameter shapes

| `type` | `params` |
|---|---|
| `hostel_closure` | Exactly one of `{ roomId }` or `{ block }`; optional paired `from` and `to` IST strings (`YYYY-MM-DD HH:mm`) |
| `late_contingent` | `{ contingentId, newArrival }` |
| `duplicate_record` | `{ keepId, dropId }`, distinct participant IDs |
| `equipment_failure` | `{ item, qty? }`; quantity is a positive integer when supplied |
| `venue_change` | `{ venueId, from?, to? }`; optional times must be paired and ordered |
| `vendor_shutdown` | `{ vendorId, from?, to? }`; optional times must be paired and ordered |
| `duplicate_merch_claim` | `{ participantId, item }` |
| `constraint_change` | `{ constraintId, enabled, params? }`; constraint must exist, `enabled` is boolean, and `ACC_MAX_DISTANCE.params.maxKm` is non-negative |

### Commit roles

The Festival Director can commit every type. In addition: `hostel_closure` → Hospitality; `late_contingent` → Hospitality, Events, or Registration; `duplicate_record` → Registration; `equipment_failure` → Logistics; `venue_change` → Events; `vendor_shutdown` → Food; `duplicate_merch_claim` → Merchandise; `constraint_change` → Hospitality or Events. Risk checks and a reason are still enforced server-side.

No shared response shape changed in this stage. The fix aligns the existing `constraint_change` type with its intended commit roles.
