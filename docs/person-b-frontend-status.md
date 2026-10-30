# Person B frontend status

## Initial state

- Branch at start: `main`.
- Initial `git status --short`: ` M .gitignore`. That pre-existing user change is preserved and excluded from this work.
- Frontend structure matched the handoff; `docs/` was absent.
- `npm` executable is not available in this environment. Dependencies were installed with the available pnpm runtime; the existing npm lockfile was regenerated through a temporary npm CLI.

## Completion summary

- **Phase 1:** configurable timeout-aware API client; JSON/non-JSON handling and typed HTTP errors; global 401 session end; CSV download checks; domain services for every page; explicit demo fixtures for reads and simulated writes; persistent demo banner; reusable UI components; protected hash routes and role-filtered navigation; endpoint contract and Person A requests.
- **Phase 2:** dashboard refresh/error/freshness and unavailable values; disruption type-driven forms, validation, preview invalidation, readable summary, role gate, confirmation and commit outcomes; exact plan write/export permissions, draft/active labels and schedule pagination/reason codes; participant debounce/cancellation/masking and logged reveal; independent DataQuality/Audit errors, counts and pagination; API-supported filters only; exact audit verification JSON; transient `/me` failures retain the token; login is blank by default.
- **Phase 3:** read-only inventory, merch, vendor and coverage views; rooms and unplaced accommodation details; contingent headcount detail; events/venues derived read-only from `/schedule/active`. Create/edit events and venues remain proposed because no backend routes exist.
- **Phase 4:** Vitest, Testing Library, jsdom and Playwright scripts/configuration and tests added. Unit tests cover API error classes/base URL, services in demo and real modes, core page behavior, permissions, dialogs, routing and login. Playwright demo tests cover sign-in, dashboard, schedule conflict, disruption preview/confirm/result, audit, tablet navigation and dialog keyboard focus.
- **Phase 5:** labelled fields, keyboard focus trap/return in dialogs, live status messages, text labels in addition to severity colors, responsive tables/navigation and tablet CSS.

## Dashboarding strategy

Control Tower is the first post-login page and monitors backend-owned counts, bed placement, schedule clashes, open issues and alerts. It shows the last successful refresh; a failed poll keeps the last snapshot visible with a retry. Missing fields are shown as unavailable. Acknowledgements go through the API. Polling is every 15 seconds because the backend has no push-update route. The frontend does not decide whether a plan or allocation is valid.

## Branching strategy

No branch operation was performed. For future Person B work:

1. Use `main` as integration branch and create short-lived branches from its latest revision.
2. Name branches `codex/person-b/<area>-<short-description>` (for example `codex/person-b/disruption-workflow`).
3. Keep changes within `frontend/` and `docs/`; record backend work for Person A in the contract doc.
4. Review the complete diff, run build/unit/E2E checks, and record any checks skipped before opening a PR.
5. Integrate by reviewed PR/merge; resolve conflicts on the feature branch and do not force-push shared branches.

## Demo mode

Set `VITE_DEMO_MODE=true` and restart Vite. Login offers labelled test-account quick-fill, then uses a demo session. All service reads use deterministic fixtures; demo writes return simulated responses without contacting or persisting to the API. The banner remains visible on login and authenticated pages. The demo schedule deliberately includes a participant-clash reason code for walkthroughs.

## Endpoint status and backend dependencies

See [frontend-backend-contract.md](frontend-backend-contract.md) for method, path, query/body, response shape, permission, implementation state and demo/real boundary. Events and venues read/write routes are **PROPOSED, BACKEND IMPLEMENTATION REQUIRED**; UI only derives a read view from schedule slots. Person A requests include correcting `constraint_replan` to `constraint_change`, restricting audit permissions, returning 401 for invalid login, adding backend dashboard freshness/audit filtering if needed, and binding commit to preview state.

## Commands and results

| Command | Result |
|---|---|
| `npm install` (`frontend/`) | Could not run; no `npm` executable. pnpm installed the declared dev tools. |
| `node node_modules/vite/bin/vite.js build` (`frontend/`) | Passed; Vite 5.4.21 production build, 44 modules transformed. |
| `node node_modules/vitest/vitest.mjs run` (`frontend/`) | Passed 47/47 tests across 9 files. |
| `node node_modules/@playwright/test/cli.js test` (`frontend/`) | Passed 4/4 Chromium end-to-end scenarios. |
| `node --test tests/engines.test.js` (`backend/`) | Passed 15/15 at baseline; backend unchanged by Person B. |
| Real API / MongoDB checks | **NOT RUN**; replica set and backend server were not started. |

`pnpm-workspace.yaml` approves the esbuild dependency script required by Vitest. Direct Node entry points were used because pnpm’s script wrapper attempts a sandboxed workspace symlink in this environment.

## Security, privacy and remaining external work

- Server permissions remain authoritative; role-filtered navigation is a usability aid. Sensitive reveal requires a reason and uses the backend audit route.
- Real API errors never fall back to demo data. Demo mode is explicit, visible, and its writes are non-persistent simulations.
- CSV exports use the authenticated API client and check status before download.
- No frontend work remains from the requested phases. Real MongoDB integration checks remain unrun. Backend changes listed in the contract belong to Person A.

## Git state for this completion

This completion is being prepared on the existing `main` branch. Only task files under `frontend/` and `docs/` are staged; the initial root `.gitignore` modification is excluded and preserved.
