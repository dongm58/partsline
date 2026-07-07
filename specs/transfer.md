# PartsLine — Spec: Step 4b, Transfer + Set-Aside

**Goal of this step:** give the agent two ways to end a call well. Hand off cleanly to a human when the request is out of lane (with the context already captured), and hold a found part under the caller's first name. This is the rest of the MVP caller flow that step 4 deliberately left out.

**Depends on:** step 4 (retrieval brain) merged. Set-aside needs a successfully quoted part, and transfer needs the vehicle/part context that step 4's flow captures.

---

## Build orchestration

For running this alongside other coding agents.

- **Depends on:** step 4 merged into `/agent/main.py`.
- **Owns (safe to edit freely):** `/agent/tools/set_aside.py`, `/agent/tools/transfer.py`, `/agent/outcome.py`, and the transfer + set-aside sections of the system prompt.
- **Shared files, append only (do not rewrite):** `/agent/main.py` (register two tools), `/agent/prompts.py` (add two sections).
- **Parallel-safe with:** a frontend agent and the step-5 call-log persistence agent, *as long as `outcome.py` (Task 1) is frozen first*. Not parallel-safe with any other agent editing `main.py` or `prompts.py` in the same run.
- **Freeze first:** the `CallOutcome` schema in Task 1 is the contract step 5 consumes. Land it before dispatching the step-5 agents.

---

## Why

Step 4 makes the agent good at the one call it's built for. But real callers ask things it should not answer, and callers who get a good answer often want the part held. A parts agent that tries to answer a warranty question, or that finds the part but can't hold it, is not usable. This step handles both, and it defines the call-outcome record that step 5 will persist and display.

Transfer matters for safety too. The four transfer triggers (modifications, interchange, returns/warranty, fleet pricing) are exactly the questions where a wrong grounded-sounding answer does damage. The right move is a cheerful handoff, not a guess.

---

## What

### Set-aside

- **Precondition:** a part was successfully found and quoted this call (a `single_match`, or a resolved `superseded` replacement) and its stock is greater than zero.
- **Flow:** caller asks to hold it. Agent gets the caller's first name if it doesn't have it, calls `set_aside`, and confirms clearly: "Done, I've set aside 2 of the A-100B under Mike. They'll be at the counter."
- **Tool:** `set_aside(first_name, part_number, quantity=1)`. Validates the part was quoted this call and is in stock. Rejects a set-aside on a `no_match` or a zero-stock part. Updates the `CallOutcome`. Default quantity is 1 unless the caller says otherwise.

### Transfer with context

- **Triggers:** the agent hands off, cheerfully and immediately, when the caller asks about any of: vehicle modifications, interchange / cross-reference ("what else fits"), returns or warranty, fleet or commercial pricing. Also for anything genuinely out of the single-part-lookup lane (ordering, order status, multi-part requests).
- **Flow:** agent does not attempt the answer. It says a warm handoff line ("Let me grab someone who can help with that, one moment") and captures the context.
- **Tool:** `transfer_to_human(reason)`. Sets `CallOutcome.transfer` with the reason and the captured vehicle/part context, and emits a transfer data-event to the room. Returns a signal for the agent to speak the handoff line.
- **v1 reality:** there is no telephony and no live human, so transfer is simulated. It is a cheerful handoff line plus a fully-captured context record plus an emitted event. Real human routing is post-v1. The point of v1 is that the context is captured so a human *could* pick it up.

### The CallOutcome record (the frozen contract)

This is the shared schema step 5 persists to SQLite and renders at `/calls`. Freeze it here.

- `call_id`, `started_at`
- `vehicle`: { `year`, `make`, `model`, `engine?`, `trim?` }
- `parts`: list of { `part_number`, `name`, `price`, `stock`, `resolution` } where `resolution` is one of `quoted`, `superseded_quoted`
- `set_aside`: { `first_name`, `part_number`, `quantity` } or null
- `transfer`: { `reason`, `context_summary` } or null
- `outcome`: one of `quoted`, `set_aside`, `transferred`, `no_match`, `abandoned`

---

## Constraints

- **Do not answer the transfer-trigger questions.** Modifications, interchange, returns/warranty, fleet pricing all route to `transfer_to_human`, never to a grounded-sounding guess.
- **Set-aside only on a real, in-stock, quoted part.** No holding a part that came back `no_match` or has zero stock.
- **Transfer is simulated in v1.** Do not add SIP, phone numbers, or any real routing. Handoff line plus captured context plus emitted event, nothing more.
- **Do not persist to a database here.** Persistence is step 5. This step captures the `CallOutcome` in session state and emits events. It defines the schema but does not write the DB.
- **Still one part per call.** Multi-part is out.
- **Append to the shared files, do not rewrite them.** Register the two tools in `main.py` and add two prompt sections in `prompts.py`. Leave step 4's wiring intact.
- **Keep the LiveKit 1.x AgentSession.** No reverting to deprecated agent classes.
- No new libraries beyond what step 4 already added.

---

## Tasks

Tasks 1-3 are standalone and parallel-safe. Task 4 is the shared-file integration and is the serial part.

### Task 1 — Freeze the CallOutcome schema

- **Build:** The `CallOutcome` structure exactly as specified in What, plus helpers to update it (record a quoted part, record a set-aside, record a transfer, set the final outcome). Nothing writes to a database.
- **Files:** `/agent/outcome.py`.
- **Verify:** The schema is documented and importable. A short script can build a `CallOutcome`, record a quote, then a set-aside, and read back a consistent record. Confirm the step-5 agent can consume this shape before dispatching it.

### Task 2 — set_aside tool (standalone)

- **Build:** `set_aside(first_name, part_number, quantity=1)` with its validation and `CallOutcome` update.
- **Files:** `/agent/tools/set_aside.py`.
- **Verify:** CLI-drive it. A quoted, in-stock part records a hold and returns a confirmation. A zero-stock part or a part that was never quoted this call is rejected with a clear reason.

### Task 3 — transfer_to_human tool (standalone)

- **Build:** `transfer_to_human(reason)` that sets `CallOutcome.transfer` with the reason and a context summary (vehicle plus part discussed), emits the transfer event payload, and returns the speak-handoff signal.
- **Files:** `/agent/tools/transfer.py`.
- **Verify:** CLI-drive it. Calling it produces a transfer record carrying the current vehicle/part context and an event payload a frontend could render.

### Task 4 — Wire tools and prompt into the session

- **Build:** Register both tools in `main.py` (append to step 4's registration). Add two prompt sections in `prompts.py`: the transfer triggers with the cheerful-handoff instruction, and the set-aside flow (offer to hold, get first name, confirm).
- **Files:** `/agent/main.py`, `/agent/prompts.py`.
- **Verify by voice:** Ask a fleet-pricing question, the agent transfers warmly instead of answering, and the transfer record carries the vehicle/part context. Separately, find a part, then say "can you hold those for me," the agent asks your first name and confirms the set-aside.

### Task 5 — Trigger and guard verification pass

- **Build:** No new feature. Confirm coverage and tighten the prompt only if a trigger leaks.
- **Files:** none, or minor prompt edits.
- **Verify:** Each of the four triggers (modifications, interchange, returns/warranty, fleet pricing) routes to a transfer rather than an answer. A set-aside attempt on a no-match or zero-stock part is refused. The `outcome` field ends up correct for each path.

---

## Definition of done

By voice, against the step-4 agent:

1. A caller who gets a quote can have the part held under a first name, confirmed back clearly.
2. Set-aside is refused on parts that weren't quoted or are out of stock.
3. Each of the four out-of-lane triggers produces a warm handoff, not an answer.
4. Every transfer carries the vehicle and part context.
5. `outcome.py` produces a `CallOutcome` record that step 5 can persist and display without changes.

When these hold, the caller flow is complete end to end, and step 5 can wire the call log and the transcript chips on top.