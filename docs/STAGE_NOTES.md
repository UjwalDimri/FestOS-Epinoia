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

## Stage P1 verification continuation — 2026-10-30

- Branch/baseline: `feature/backend-disruptions`, starting at `9ffcaf1`; working tree was clean before this continuation.
- Files changed/created:
  - Source: `backend/src/constraints/index.js` and `backend/src/services/assumptions.js` (allow state reads inside a transaction); `backend/src/services/state.js` (transaction-aware state/plan reads); `backend/src/services/plans.js` (build schedule draft in the disruption session); `backend/src/services/disruptions.js` (transaction-snapshot revalidation, atomic schedule plan activation, claim-based idempotency, persisted stable response); `backend/src/services/command.js` (additional audit entries inside the same transaction); `backend/src/models/governance.js` (internal `committing` state and preserve empty result objects); `backend/src/services/disruptionTestDbGuard.js` (strict DB-name guard).
  - Tests: `backend/tests/integration/disruptions.integration.test.js` (isolated persisted-state coverage for all eight types); `backend/tests/disruptions.test.js` (guard tests); `backend/package.json` (the one allowed `test:integration` script).
  - Docs: updated `docs/API_CONTRACTS.md`; appended this continuation to the stage log.
- Work completed and proven:
  - All eight preview handlers leave every committed model collection unchanged and report the impact fields available for their scenario.
  - All eight commit paths are exercised against a real single-node replica set and guarded `festos_test` database.
  - Late-contingent commit revalidates participant arrivals after preview; newer arrivals are retained.
  - Sequential retries return the same stored response. Concurrent duplicate commits create one domain change and one audit record. Duplicate merch claims use the same idempotent behavior.
  - A disallowed role is rejected without committed-state changes. A duplicate merge involving already-issued merch is high risk and requires Director approval.
  - Injected failures in a constraint commit and schedule generation both roll back domain writes, disruption status, new plan/slots, and audit writes.
  - Venue/equipment schedule rebuild and activation now share the disruption transaction; the audit chain records both the disruption and `PLAN_ACTIVATE`.
  - Actor, reason, action, audit-chain integrity, duplicate registration handling, stock movements, vendor incidents, and room closure/allocation release were checked in persisted state.
- Exact commands and results:
  - `npm test` (from `backend/`): **21 passed, 0 failed, 0 skipped**.
  - `MONGODB_TEST_URI='mongodb://127.0.0.1:27019/festos_test?replicaSet=rs0' npm run test:integration` (from `backend/`): **13 passed, 0 failed, 0 skipped** on the final run. The URI guard permits only the database name `festos_test`; setup and teardown delete documents only in that database.
  - `find src tests -name '*.js' -print0 | xargs -0 -n1 node --check` (from `backend/`): passed.
  - `git diff --check`: passed before final review.
  - `mkdir -p /private/tmp/festos-p1-rs-db && mongod --dbpath /private/tmp/festos-p1-rs-db --replSet rs0 --port 27019 --bind_ip 127.0.0.1 --fork --logpath /private/tmp/festos-p1-mongod.log`: first startup attempt failed because this macOS mongod does not support `--fork`.
  - `mongod --dbpath /private/tmp/festos-p1-rs-db --replSet rs0 --port 27019 --bind_ip 127.0.0.1` in a foreground session, followed by `mongosh 'mongodb://127.0.0.1:27019/admin?directConnection=true' --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27019"}]})'`: started the fresh temporary replica set successfully; shutdown was clean after tests.
  - Initial sandboxed integration attempt failed before tests with `connect EPERM`. First escalated DB run reached the suite but found four incorrect fixture expectations; the fixtures were corrected. A later concurrent-retry test found a stored response normalization mismatch; the result persistence was corrected. Final counts above are from the passing reruns.
- Audit/status update: P1 persisted-state verification is complete for the covered fixtures. The earlier continuation's P1 limitations around snapshots, rollback, retry idempotency, per-type commit workflows, and schedule transaction boundaries have been addressed by this continuation.
- Remaining scope outside P1: full P2 route/auth/privacy matrix, P3 adversarial hash-chain tests, broader real-data schedule/allocation tests, and API HTTP-level disruption tests remain for their assigned stages or follow-up. The synthetic fixture suite does not replace the demo data review.
- Person B / Team 1: no frontend change or Team 1 dependency. Endpoint paths and response envelope remain stable; repeated commit behavior now safely returns the stored result.
- Suggested commit message: `fix(backend): make disruption commits atomic and idempotent`
- Handoff: P1 is ready for the user's merge/handoff process before beginning P2.
