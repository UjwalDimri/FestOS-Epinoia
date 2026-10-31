# FestOS — Epinoia 2026 control portal (backend + frontend)

FestOS is an internal control portal for the people running Aarohan. It checks the data, plans scarce resources
(beds, slots, equipment, merch, meals), lets an organizer inject a disruption and preview its impact, commits only with a
reason, and records every change in a tamper-evident audit log.

## Quick start (about 5 minutes)

Requirements: Node 20+, MongoDB 6+ as a **replica set** (transactions need one). Atlas M0 works too. Run each section in a separate VS Code terminal and leave it open.

```bash
# 1. Database: local replica set (Terminal 1)
cd backend
mkdir -p mdb-run
mongod --replSet rs0 --dbpath ./mdb-run --port 27018 --bind_ip 127.0.0.1

# 2. Backend (Terminal 2)
cd backend
cp .env.example .env                      # edit JWT_SECRET and, optionally, ANTHROPIC_API_KEY
npm install
npm run init:replica                      # one time per database
npm run seed                              # imports the 11 CSVs from ../data/raw, creates test accounts, activates starting plans
npm run dev                               # http://localhost:4000

# 3. Frontend (Terminal 3)
cd frontend
npm install
npm run dev -- --host 127.0.0.1           # http://localhost:5173
```

Reset the demo at any time: `cd backend && npm run reset:demo` (under 10 seconds).
Tests: `cd backend && npm test` (15 engine tests, no database needed).

## Test accounts

Password for every account: **FestOS@2026** (set `SEED_PASSWORD` in `.env` to change).

| Email | Role |
|---|---|
| director@festos.test | Festival Director (everything, approves high-risk overrides) |
| hospitality@festos.test | Hospitality |
| registration@festos.test | Registration Desk |
| events@festos.test | Events Team |
| logistics@festos.test | Logistics Head |
| merch@festos.test | Merchandise Desk |
| food@festos.test | Food Coordinator |
| volunteer@festos.test | Volunteer (read-only, names only) |

## What the backend does

| Area | Behaviour |
|---|---|
| Import | Reads all 11 CSVs. Keeps the raw row, normalises, and writes a `DataIssue` for every problem found. Nothing is dropped silently. |
| Accessibility and gender | An explicit "None" is stored as `declared_none`. A blank is `not_declared`. A blank gender is `unconfirmed` and is never placed in a boys or girls block. |
| Duplicates | Scores pairs on several fields (name and contingent block the search; age, gender, t-shirt, diet, access, arrival and departure score). Candidates go to a human. Nothing is auto-merged. |
| Accommodation | Allocates bed-nights, not beds. A cleaning buffer applies between guests. Hard rules filter candidates, soft rules add weighted penalties. Three strategies run side by side. Unplaced people get reason codes. |
| Schedule | Generates prelim heats from registrations (heats grouped by arrival), checks venue features, capacity, windows and closures, participant clashes, presence, travel buffers, judges, volunteers and equipment. Later rounds wait for results. |
| Vendors | Coverage matrix: day × meal × diet. A vendor counts only with a valid certificate, inside opening hours, not interrupted, and with enough capacity. |
| Merch | One original issue per person per item, enforced by a unique index. A duplicate claim returns the original issue. Replacements need a reason. |
| Disruptions | Eight types, each a preview then a commit: hostel closure, late contingent, duplicate record, equipment failure, venue change, vendor shutdown, duplicate merch claim, constraint change. Preview writes nothing. Commit is audited and checks the committer's role. |
| Constraints | Every rule is a registry entry. Each can be turned on or off with parameters from the constraint change disruption. Curfew, distance, minors-on-campus and transport rules are registered but off by default. |
| Assumptions | Every number the data doesn't provide (budget, buffers, heat sizes, venue features) is stored in MongoDB and changed through an audited, high-risk, Director-only endpoint. |
| Privacy | Role comes from the server. Participant fields are masked per role. Contact and sensitive fields are revealed only with a reason, and each reveal is logged. |
| Audit | Append-only, hash-chained. `GET /api/audit/verify` recomputes the chain. Changing a stored entry breaks it at that sequence number. |
| Alerts | Control-tower rules, upserted by key. Each alert has an owner role, severity and suggested action. Unacknowledged alerts escalate to the Director after 15 minutes. |
| Explanations | Reason codes map to sentences from templates. Claude rewrites them only when `ANTHROPIC_API_KEY` is set, with no names or medical data sent, and falls back to templates on any error. |

## API overview (all under /api, Bearer token)

- `POST /auth/login` · `GET /me` · `GET /dashboard` · `GET /alerts` · `POST /alerts/:key/ack`
- `GET /participants` (masked, `page`, `limit`, `q`, `contingent`, `housing`, `flag` filters) · `GET /participants/:id` · `POST /participants` · `POST /participants/:id/reveal` · `POST /participants/:id/housing`
- `GET /contingents` (paged, optional `q` search) · `GET /contingents/:id` (paged, role-masked members and declared-strength delta) · `POST /contingents`
- `GET /data/issues` · `GET /data/headcount` · `GET /data/duplicates` · `POST /data/duplicates/:id/dismiss` · `POST /data/issues/:id/resolve`
- `POST /plans/accommodation` · `POST /plans/schedule` · `POST /plans/:planId/activate` · `GET /accommodation/compare` · `GET /accommodation/active` · `GET /accommodation/unplaced` · `GET /rooms`
- `GET /schedule/active`
- `GET /staff` (role-masked core-team roster and 24-hour shift coverage gaps)
- `GET /inventory` · `POST /inventory/move`
- `GET /merch` · `POST /merch/issue` · `POST /merch/replace`
- `GET /vendors` · `GET /vendors/coverage` · `POST /vendors/:id/log-meal`
- `GET /disruptions` · `POST /disruptions/preview` · `POST /disruptions/:id/commit`
- `GET /constraints` · `GET /assumptions` · `PUT /assumptions/:key`
- `GET /audit` · `GET /audit/verify`
- `GET /export/accommodation.csv` · `GET /export/schedule.csv` · `GET /export/inventory.csv`

### Team 1 data contracts

- Participant fields follow the Team 1 sheet: `participantId` (ID), `name`, `college`, `contingentId`, `gender`, `age`, `contact`, `accessibilityNeeds`, `dietaryNeeds`, `arrivalDateTime`, `departureDateTime`, `accommodationRequested`, and `tshirtSize`. Declared/none/unknown states remain attached to the accessibility and dietary needs so blank data is not treated as a declaration. Duplicate candidates stay reviewable instead of being silently merged.
- Contingents use `college`, `contingentId` (contingent number), `leader`, `escort`, `strengthDeclared`, and `preferences`. Use `POST /participants` with `participantId`, `name`, and an existing `contingentId`; use `POST /contingents` to create a contingent. Participant responses remain role-masked.
- Accommodation uses `Room` fields `roomId`, `block`, `floor`, `gender`, `capacity`, `accessibility`, and `status`, plus `ExternalProperty` fields `propertyId`, `propertyName`, `beds`, `costPerBedPerNight`, `distanceKm`, and `transportAvailability`. `Plan` stores a run and `Allocation` stores each person's proposed or committed stay. Start with `POST /plans/accommodation`; inspect with `GET /accommodation/compare`, `GET /accommodation/active`, `GET /accommodation/unplaced`, and `GET /rooms`.
- Write operations use the existing JSON resource responses and error shape (`{ "error": "...", "details": ... }`), and are recorded in the audit log. Participant creation requires participant-write permission; contingent creation is limited to the registration desk and Festival Director.
- On startup, the backend renames the previous participant, contingent, room, and external-property paths in place so existing MongoDB records keep their data under the Team 1 field names.

## Live-test runbook

1. Sign in as the Festival Director and open **Disruptions**.
2. Choose a scenario, change the parameters to what the judges give you, and click **Preview impact**.
3. Read the impact: displaced people, rehoused and unplaced, cost against budget, slots affected, coverage lost.
4. Write a reason and click **Commit change**. Schedule-affecting changes re-plan automatically.
5. Open **Audit** and verify the chain. Show the new entry.

Sample inputs that exist in the data: rooms `B1-0-01`, `G1-0-01`; contingents `C05`, `C15`; venues `V04` (Amphitheatre), `V05` (Quadrangle), `V06` (Hostel Lawn); vendor `VND02` (Vendor B, the only gluten-free provider); duplicate pair `P0119` / `P_DUP02`; merch `P0001` T-shirt.

## Midnight twist

1. Add the rule to `src/constraints/` with `register({...})` (or change an assumption in the API).
2. Turn it on from Disruptions → constraint change, or `PUT /assumptions/:key` as the Director.
3. Preview to see the impact, then commit with a reason. Changes flow through the same audit path.

## Known gaps (be honest on the slide)

- **Clerk login is coded but untested here**: it needs real `CLERK_*` keys. Dev mode (email + password) is the tested path.
- **Claude explainer is untested here**: the sandbox has no API key. The template path is tested.
- **Live updates use polling** every 5 seconds. Socket.io is not wired up.
- **Later rounds** (semis and finals) are sized and marked "waiting for results". They have no participants until prelims produce results.
- **Schedule clashes remain** (58 at the default settings). People in three events cannot be everywhere. The engine reports them rather than hiding them.
- **Judges, venue features, budget, buffers and heat sizes** are assumptions (see the `assumptions` collection). They are not in the data.
- **Frontend is deliberately basic**: no design system, no keyboard shortcuts, no offline mode.

## Data findings that drive the design (verified on the pack)

- Participants: 2,836 records, 2,842 declared by contingents, about 2,400 in the narrative. Seven contingents disagree with their declared strength.
- **Accessibility**: 515 people declared a need, 2,321 explicitly wrote "None", and 38 escorts have no declaration. pandas reads the text "None" as missing, so pandas counts are wrong for this field.
- Gender: 627 female, 558 male, 323 non-binary, 671 unconfirmed (prefer not to say or blank).
- Peak bed demand is 1,573 on 30 Oct and 1,580 on 31 Oct against 1,450 beds, a shortfall of 123 and 130 at those peaks.
- Vendors: 4 certificates expired on 29 Sep, 4 more expire on 31 Oct. No vendor declares nut-free or Jain food. Gluten-free headcount on site (262 to 304) exceeds Vendor B's capacity of 180.
- Inventory: all four table lines and all cameras are unusable. Projectors are not short.
- Staff: no Food Coordinator on the 14:00 to 22:00 shift. Six people hold the Festival Director role.

## AI disclosure (for the required slide)

- **What AI did**: An AI assistant (Claude) wrote most of the code from the team's written architecture, and drafted the review of the master plan. It also wrote the data profiling queries.
- **What the team decided**: the architecture, the hard and soft constraint split, the risk levels for overrides, the strategy weights, the assumptions, and the rule that Claude never makes decisions.
- **How outputs were checked**: the import was run on the real CSV pack, and the allocator and scheduler were run and checked against the data. Running on the real data surfaced several bugs, all fixed: the "None" accessibility misreading, schedule summaries that returned the wrong object, and a vendor shutdown preview that missed capacity losses. The 15 engine tests cover the hard rules. The audit tamper check was run by hand and detected a changed entry. The live disruptions were previewed and committed over HTTP.
- No personal data is sent to any external service. The Claude explainer, when enabled, receives reason codes only.
