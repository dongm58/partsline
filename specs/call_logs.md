# PartsLine — Spec: Step 5, Call Log + Transcript Chips

**Goal of this step:** turn the working agent into a demo-able product. Show each retrieval as it fires (the proof layer that makes grounding visible), and keep a shop-facing record of every call. This is the last feature before evals.

**Depends on:** step 4b (`outcome.py` / `CallOutcome`) merged, and the event schema frozen below. The web work can start as soon as the two contracts in this spec are frozen, before the agent wiring is finished.

---

## Build orchestration

For running this across parallel lanes (see the parallel-setup doc).

- **Depends on:** step 4b merged, plus the event schema and CALL_LOG table schema (Task 1 and the What section) frozen.
- **Lanes:**
  - **Tools lane** owns `/agent/db.py`.
  - **Web lane** owns `/app/page.tsx` (real demo page), `/app/calls/*`, `/app/api/calls/route.ts`, and the transcript/chip components.
  - **Integrator lane** owns the additions to `/agent/main.py` (emit events, write the outcome at call end).
- **Parallel-safe:** the tools lane and the web lane can run at the same time against the frozen schemas. The integrator lane wires as their modules land.
- **Freeze first:** the four event payloads and the CALL_LOG table schema. Both are in this spec. Land them before dispatching the lanes.

---

## Why

Two audiences, two pieces.

The **chips** are for the demo audience. Every time the agent looks something up, a chip appears inline in the transcript showing the vehicle filter it used and what came back. That is the visible proof the agent is grounded, that it is not inventing parts. It is the single most convincing thing in the demo, because it shows the RAV4 refusal and the disambiguation actually happening in real time.

The **call log** is for the shop. A newest-first list of what came in: the vehicle, the part, how the call ended, and any set-aside name. It is deliberately minimal, an append-only record, not analytics.

---

## What

### The agent-to-frontend event schema (frozen contract)

The agent emits these as data messages into the LiveKit room. The web page renders them. These names and shapes are the contract the web lane builds against.

- `transcript` — { `role`: "caller" | "agent", `text`: string, `final`: bool }
- `lookup_chip` — { `filter`: { year, make, model, engine? }, `result`: "single" | "ambiguous" | "superseded" | "no_match", `parts`: [ { part_number, name, price?, stock? } ] }
- `transfer` — { `reason`: string, `context_summary`: string }
- `call_ended` — { `call_id`: string, `outcome`: string }

### The CALL_LOG table (frozen contract)

SQLite, append-only, one row per completed call. This is the only table.

- `call_id` TEXT primary key
- `started_at` TEXT (ISO timestamp)
- `vehicle` TEXT (JSON: year, make, model, engine?, trim?)
- `parts` TEXT (JSON: list of { part_number, name, price, stock, resolution })
- `set_aside` TEXT (JSON or null)
- `transfer` TEXT (JSON or null)
- `outcome` TEXT (one of quoted, set_aside, transferred, no_match, abandoned)

The web `/calls` page reads this file read-only through `/api/calls`. The Python side is the only writer.

### The real demo page

Evolve the bare `/voice-test` page into the real demo page at `/`: one talk button, a live transcript, and inline lookup-chips. Reuse the connection logic already proven in `/voice-test`.

### Chip rendering

Each `lookup_chip` event renders a chip in the transcript at the point it fired. Label it by result: a found chip for `single`, an asking chip for `ambiguous` (show the candidate values), a replaced chip for `superseded` (show old to new), and a not-carried chip for `no_match`. The chip shows the vehicle filter that was applied, so the proof is visible: this answer came from a filtered lookup, not a guess.

### The /calls page

A single newest-first list. Each row shows time, vehicle, the part(s) discussed, the outcome, and the set-aside name when present. No editing, no filtering controls, no pagination for v1.

---

## Constraints

- **CALL_LOG is append-only.** Never update or delete a row. One completed call, one row.
- **SQLite, CALL_LOG only.** No other tables. The catalog source of truth stays JSON in the repo, not the database.
- **The web side reads the DB, never writes it.** The Python side is the sole writer, through `db.py`.
- **Chips render from emitted events.** The frontend never re-queries Moss to build a chip. Everything it shows came from an event the agent emitted.
- **Do not rebuild the agent.** This step adds event emission and an end-of-call write to `main.py`. Leave the step 4 and 4b behavior intact.
- **Out of scope:** auth, analytics, CRM, editing or deleting calls, multi-tenancy, real POS integration, public deploy.
- **Libraries:** a plain SQLite driver on both sides (Python stdlib `sqlite3` for writing, a lightweight node SQLite reader such as better-sqlite3 for `/api/calls`). Do not add an ORM or a heavier data layer for one append-only table.

---

## Tasks

Lane-tagged and ordered so the frozen contracts come first. Verifies are written as test targets where the task is testable, and as manual checks where it is voice or visual.

### Task 1 — [tools] db.py: schema, write, read

- **Build:** `db.py` that creates the CALL_LOG table, `save_call(outcome)` to append a `CallOutcome` as one row, and `list_calls()` to return them newest-first.
- **Files:** `/agent/db.py`.
- **Verify (test target):** a failing test that saves two `CallOutcome` records and asserts `list_calls()` returns both, newest first, and that a second save never mutates the first row (append-only). Make it pass.

### Task 2 — [integrator] write the outcome at call end

- **Build:** on call end, call `save_call` with the session's `CallOutcome`, then emit `call_ended`.
- **Files:** `/agent/main.py`.
- **Verify:** run a full call by voice. A matching row appears in CALL_LOG with the correct outcome.

### Task 3 — [integrator] emit lookup_chip events

- **Build:** each time `lookup_part` fires, emit a `lookup_chip` event carrying the filter used, the result type, and the returned part(s).
- **Files:** `/agent/main.py` (a thin wrapper around the tool call).
- **Verify (test target):** a failing test that invokes the wrapped lookup for the dual-engine case and asserts an `ambiguous` chip payload with the candidate engine values is emitted. Make it pass. Then confirm by voice.

### Task 4 — [web] real demo page

- **Build:** the demo page at `/` with the talk button and live transcript, reusing the `/voice-test` connection logic.
- **Files:** `/app/page.tsx` plus shared client components.
- **Verify:** click talk, speak, see the transcript update live and hear the agent.

### Task 5 — [web] inline lookup-chips

- **Build:** render `lookup_chip` events as inline chips in the transcript, labeled by result type, showing the vehicle filter.
- **Files:** `/app` chip component(s).
- **Verify:** run the four scenarios. Each produces the right chip: found, asking (with candidates), replaced (old to new), not-carried. The RAV4 call shows a not-carried chip, which is the proof moment.

### Task 6 — [web] /calls page

- **Build:** `/api/calls` reads CALL_LOG newest-first; `/calls` renders the list.
- **Files:** `/app/api/calls/route.ts`, `/app/calls/page.tsx`.
- **Verify:** after several calls, `/calls` lists them newest-first with vehicle, part(s), outcome, and any set-aside name.

### Task 7 — [integrator + web] end-to-end proof-layer check

- **Build:** none, integration only.
- **Verify:** a single call shows the live transcript with chips appearing as each lookup fires, ends cleanly, and lands as a row on `/calls`. This is the full demo path.

---

## Definition of done

1. The demo page shows a live transcript with a lookup-chip for every retrieval, labeled by result.
2. The RAV4 call visibly produces a not-carried chip, proving the refusal is real.
3. Every completed call writes exactly one append-only CALL_LOG row with the correct outcome.
4. `/calls` lists calls newest-first with vehicle, part, outcome, and set-aside name.
5. The web side never writes the database and never queries Moss directly.

When these hold, PartsLine is demo-complete, and the only thing left is the held-out eval pass (step 6).