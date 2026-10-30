# Person B frontend status

## Initial state

- Initial branch: `main`.
- Initial `git status --short`: ` M .gitignore`; that existing edit is preserved and excluded from this commit.
- The frontend structure matched the handoff. `docs/` did not exist initially.
- `npm` is unavailable in this environment. `npm install`, `npm run build`, and `npm test` could not run.
- Direct alternatives: `node node_modules/vite/bin/vite.js build` passed (42 modules transformed); `node --test tests/engines.test.js` in `backend/` passed 15/15.
- MongoDB live checks were not run. No frontend automated tests were added or run.

## Changes made

- Added a configurable API client with 15-second timeout, JSON response validation, typed HTTP errors, 401 callback, and authenticated CSV download support.
- Added page-facing service modules and deterministic fixtures selected only by `VITE_DEMO_MODE=true`; demo mode shows a persistent “DEMO DATA, not persisted” banner.
- Added shared UI primitives, hash navigation, unknown-route handling, permission-filtered navigation, and improved session validation behavior.
- Updated Dashboard with 15-second polling, refresh timestamp, retryable errors, and unavailable values instead of invented zeros.
- Removed prefilled credentials; dev quick-fill appears only in demo mode.
- Updated Plans permissions, CSV handling, and 40-slot pagination.
- Added the endpoint contract and Person A request list in `frontend-backend-contract.md`.

## Dashboarding strategy

The Control Tower is the first page after login and acts as a monitoring surface. It shows backend-reported people, accommodation, schedule and data-quality metrics, alert severity/ownership, and the last successful refresh. Missing data remains unavailable. A failed poll preserves the last successful snapshot and offers retry. Acknowledgement is sent to the backend. Polling runs every 15 seconds; the backend has no push-update contract. The frontend does not decide whether allocations or plans are valid.

## Branching strategy

No branch operation was performed. For continued team work:

1. Keep `main` as the integration branch; create short-lived work branches from an updated `main`.
2. Name branches `codex/person-b/<area>-<short-description>`, such as `codex/person-b/api-client` or `codex/person-b/dashboard-error-states`.
3. Keep Person B changes within `frontend/` and `docs/`; coordinate backend requests through the contract doc.
4. Before review, inspect the full diff, run `git diff --check`, build and relevant tests, and report skipped checks.
5. Integrate with a reviewed PR/merge. Resolve conflicts on the feature branch and do not force-push shared branches.

## Demo mode

Set `VITE_DEMO_MODE=true` and restart Vite. Stable fixtures cover dashboard, participant list, schedule, plan comparison/accommodation, disruption history, headcount, issues, duplicates, and audit listing. Login and unsimulated writes still use the real API; demo mode is not fully offline. Do not use it for real changes.

## Remaining work

- The broad handoff is not complete. Disruption type-specific forms, readable previews, confirmation and duplicate-blocked handling remain; participants still need debouncing, stale-response protection and reasoned reveal; DataQuality/Audit still need error handling and pagination; inventory/merch/vendor pages and accommodation/contingent detail remain.
- Several legacy pages still call `api()` directly instead of services and retain swallowed errors or `window.prompt` flows.
- The shared dialog primitive restores focus and closes on Escape but does not yet trap Tab focus.
- Demo fixtures do not cover every visible page; demo writes remain real API calls.
- No frontend automated test suite or browser accessibility review was run.

## Security and privacy

- Backend permissions remain authoritative; hidden navigation is usability only.
- No real-request failure falls back to demo data. Demo mode is explicit and visibly labeled.
- CSV downloads use the bearer token and check HTTP success.
- Existing participant masking behavior was not broadened. Reveal actions must require a reason and be audited by the backend.

## Git and test results

- `git status --short` initially: ` M .gitignore`; final status should retain this uncommitted pre-existing edit.
- `git branch --show-current`: `main`.
- `npm install`, `npm run build`, `npm test`: unavailable because `npm` is missing.
- `node node_modules/vite/bin/vite.js build`: passed.
- `node --test tests/engines.test.js`: passed, 15 tests.
- MongoDB/API live checks: not run; database was not started.
- This work has not previously been committed or pushed.
