# Stage notes

## Stage P1 (disruptions) — 2026-10-30

- Branch: `feature/backend-disruptions`
- Baseline: branch `feature/backend-disruptions`; clean working tree before edits; HEAD `4f9c0ef` (`Fix:Naming of folder structure`); previous commits `7428305`, `8e304d4`, `61acd03`.
- Files changed/created:
  - Source: `backend/src/services/disruptionValidation.js` (shared P1 request validation, arrival-delay calculation, and transaction guard); `backend/src/services/disruptions.js` (validate at preview and commit; persist each delayed arrival without overwriting later arrivals; refuse commits without transaction support); `backend/src/shared/roles.js` (authorize the implemented `constraint_change` type).
  - Tests: `backend/tests/disruptions.test.js` (arrival preservation, eight request shapes, invalid parameters, role mapping, and transaction guard); `backend/package.json` (include all DB-free `*.test.js` files in `npm test`).
  - Docs: `docs/API_CONTRACTS.md` (current P1 route shapes and roles); this audit and stage log.
- Bugs fixed and proving tests:
  - Late contingent commit previously applied the requested arrival to every member, even where a member's original arrival was later. It now applies the per-person maximum used by preview. Proved by `late arrival keeps members whose existing arrival is later than the delay`.
  - `constraint_change` had no corresponding commit-role entry because the map used `constraint_replan`. It now grants the documented Hospitality and Events roles. Proved by `events and hospitality roles can commit the implemented constraint_change type`.
  - Disruption params previously relied on scattered checks and could reach state calculations with missing/invalid values. Validation now covers all eight types, required IDs, dates/windows, positive integer quantities, and registered constraints. Proved by `all eight disruption types accept their documented parameter shapes` and `disruption validation rejects missing, malformed, and contradictory parameters`.
  - The database helper can connect without transaction support, where multi-document command writes and audit writes would otherwise be separate. Disruption commit now rejects that mode before loading or writing the disruption. Proved at guard level by `disruption commits refuse to run without transaction support`; connected replica-set commit behavior remains unverified.
- Exact commands and results:
  - `git status --short --branch && git log -5 --oneline`: baseline branch and clean tree recorded above.
  - `npm test` (from `backend/`): **20 passed, 0 failed, 0 skipped** (15 existing engine tests + 5 P1 regression tests).
  - `find src tests -name '*.js' -print0 | xargs -0 -n1 node --check` (from `backend/`): passed; no syntax errors.
  - Ephemeral local health smoke check using `createApp()` and `fetch`: **200**, `{"ok":true,"auth":"dev"}`. First sandbox attempt was denied on bind; rerun after escalation approval passed.
  - `nc -z 127.0.0.1 27018`: failed to connect; no local MongoDB listener on the configured replica-set port. No database tests, seeds, resets, or import commands were run.
- Audit report:
  - A. Architecture: Node/Express API under `backend/src`; Mongoose models; MongoDB is configured as a replica set for transactions; pure scheduling, allocation, and food engines; React frontend uses the JSON bearer-token wrapper in `frontend/src/api.js`.
  - B. Implemented features: 8 disruption preview types and commit handlers; model-backed plans, participants, venue/room, vendor, inventory, merch, audit, and governance records; role-aware preview/commit; command audit wrapper; typed HTTP errors. Route mounting and health response were confirmed by the smoke check.
  - C. Incomplete/unverified: DB-backed preview state snapshots, commit rollback, fresh-state revalidation under races, retry idempotency, schedule replan atomicity, all eight real apply handlers, Clerk mode, and live data impacts remain unverified because MongoDB was unavailable. Disruption commits now fail closed if the connected DB does not support transactions. Schedule regeneration/activation for venue/equipment changes occurs after the disruption command and therefore is not one atomic operation.
  - D. Reproducible bugs fixed: late-contingent arrival mismatch, missing `constraint_change` role mapping, and missing centralized P1 parameter validation (tests listed above).
  - E. Security concerns: commit roles and reason checks are server-side. P1 concern deferred: `GET /api/disruptions` returns full stored disruption records to any authenticated user; duplicate-record previews include names, so this may expose more than the role-specific field policy intended. Review under P2 without changing this stage's contract.
  - F. Missing tests: isolated replica-set DB snapshot checks for preview; state rollback with injected failure; concurrent/retried commit idempotency; actor/reason/outcome persistence; stale-preview behavior; actual per-type apply tests and untouched-record assertions. Current suite covers pure logic only.
  - G. Dependencies/env: dependencies are installed; backend declares Node >=20, Express, Mongoose, and MongoDB URI on port 27018 in `.env.example`. MongoDB was unavailable here. No `.env` values were printed.
  - H. Integration risks: frontend consumes the existing `/disruptions`, `/disruptions/preview`, and `/:id/commit` shapes. This stage adds no envelope or path change. The role list now correctly matches `constraint_change`. The local API contract is recorded in `docs/API_CONTRACTS.md`.
  - I. Recommended order: finish P1 isolated replica-set workflow tests (preview snapshots, all apply handlers, failures, races/retries, audit) and address atomicity before calling disruptions complete; only then proceed to the separately assigned privacy/RBAC stage.
- Deferred findings and questions:
  - Confirm whether full disruption history should be available to every authenticated role; P2 review should consider masking duplicate names and raw params.
  - Validate transaction support as a hard prerequisite for multi-document disruption commits; current fallback can run writes and audit separately.
  - Venue/equipment commits can persist before subsequent schedule planning or activation fails.
  - No open Team 1 dependency identified. Person B's frontend files were read-only and untouched; API shapes are unchanged.
- Suggested commit message: `fix(backend): validate disruptions and preserve delayed arrivals`
- Must merge before next stage: this P1 branch's remaining atomicity and DB-backed regression work should be resolved before treating P1 as done; no next stage was started here.
- Git safety: no add, commit, push, merge, rebase, reset, clean, or destructive checkout/restore was run. Branch was already selected at session start; no branch operation occurred during this stage work.
