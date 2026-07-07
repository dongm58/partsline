# PartsLine — Spec: Step 4, Retrieval Brain (Function Tools + Hard Rules)

**Goal of this step:** insert the LLM and a single grounded lookup tool into the working voice loop from step 3, so the agent can answer "do you have this part for this vehicle?" while structurally being unable to guess, quote an unfiltered result, or trust a stale part.

**Depends on:** step 2 (Moss index seeded, `moss-test/seed.py` + `query.py` proven) and step 3 (LiveKit `AgentSession` voice loop running, no LLM). This step evolves the step-3 agent, it does not restart it.

**Assumed repo layout:** Next.js at root, Python agent in `/agent`.

---

## Build orchestration

For running this alongside other coding agents.

- **Depends on:** step 2 (Moss seeded) and step 3 (voice loop / AgentSession) merged.
- **Owns (safe to edit freely):** `/agent/tools/lookup_part.py`, `/agent/tools/stock.py`, the catalog JSON, and `moss-test/seed.py`.
- **Shared files, append only (do not rewrite):** `/agent/main.py` (add the LLM and register `lookup_part`), `/agent/prompts.py` (this step creates it).
- **Parallel-safe with:** the `lookup_part` tool (Task 2) is standalone Python and can be built by a tools-focused agent in parallel with any web work. Not parallel-safe with step 3 or step 4b, since all three touch `main.py`.
- **Freeze first:** the `lookup_part` signature and its four-way return shape (`single_match` / `ambiguous` / `superseded` / `no_match`). This is the contract the disambiguation loop and step 4b both depend on.

---

## Why

Everything risky about PartsLine lives here. Your live Moss test proved three things that make a naive build dangerous:

1. **Semantic score is not a "we don't carry this" signal.** A query for a vehicle not in the catalog (the RAV4) returned other cars' parts scoring as high as genuine matches. The only trustworthy "not carried" signal is an empty result from a query that was *filtered by vehicle*.
2. **Ambiguity is visible and must be surfaced, not resolved silently.** A 2014 Outback serpentine belt returned both the 2.5L and 3.6L parts. That is the exact signal to ask "2.5 or 3.6?" rather than pick one.
3. **Dead parts can outrank their own replacement.** A discontinued part scored higher than the part that replaced it. Raw top-result ranking cannot be trusted.

So this step is not "give the LLM a search tool." It is "give the LLM one tool that makes the safe path the only path." The grounding is enforced in the tool's shape, not requested in the prompt. If the tool cannot return an answer, the agent has no other way to produce one.

---

## What

### The one tool: `lookup_part`

The LLM gets exactly one retrieval tool. There is no unfiltered search tool, no raw Moss access, nothing else it can reach for. `lookup_part` takes:

- `part` — the part name or category the caller wants (for example "serpentine belt", "front brake pads").
- `year`, `make`, `model` — **required.** The tool refuses to run without all three, so an unfiltered fitment query is impossible.
- `engine`, `trim` — optional, supplied once known (usually after a disambiguation question).

Internally the tool:

1. Normalizes the vehicle values (case and whitespace) to match how `seed.py` stored them, then builds a metadata filter from every vehicle attribute it was given. There is always at least a year+make+model filter, so it is never an unfiltered query.
2. Runs the filtered Moss query, reusing the proven access code from `moss-test/query.py`.
3. Handles dead and superseded parts before ranking: it drops source parts with `stock=0`, and when a matched part has `superseded_by` set, it follows that pointer to the end of the chain to find the current live part.
4. Attaches current stock and price. Stock is fetched through a small internal `get_stock(part_number)` helper, kept as a separate function so the future POS-sync seam stays clean.
5. Returns one of four clearly distinct results:
   - **single_match** — one current part. Carries part number, price, stock count.
   - **ambiguous** — more than one part after filtering. Carries the attribute they differ on (for example `engine`) and the candidate values (for example `["2.5", "3.6"]`).
   - **superseded** — the caller's part was replaced. Carries the old part number, the replacement part number, and the replacement's price and stock.
   - **no_match** — the filtered query returned nothing. This is the only trustworthy "we don't carry it."

### How the agent behaves (the flow)

1. Agent greets and finds out the part the caller wants and the vehicle (year, make, model).
2. Agent reads the vehicle back once in natural speech ("2014 Subaru Outback, got it") so a mangled speech-to-text vehicle gets corrected by the caller *before* any lookup declares a miss.
3. Agent calls `lookup_part`, then branches on the result:
   - **single_match** → quote it with hedged stock: "We're showing 3 of those, $42 each."
   - **ambiguous** → ask the disambiguating question about the differing attribute ("Is that the 2.5 or the 3.6?"), then call `lookup_part` again with the added attribute.
   - **superseded** → tell the caller it changed, then quote the replacement: "That one's been replaced by the A-100B, and we're showing 3 of those, $38 each." (This is your chosen behavior.)
   - **no_match** → "We don't carry a match for that vehicle." No fallback, no "close enough."
4. The captured vehicle is held in session state for the length of the call. v1 handles one part per call.

### Numbers and formats that matter

- **Stock phrasing:** always hedged. "We're showing N in stock," never "we have N."
- **No-match phrasing:** "We don't carry a match for that vehicle."
- **Superseded phrasing:** name the old-to-new change, then quote the replacement's stock and price.
- **Disambiguation:** ask only about the attribute that actually differs between the returned candidates.
- **LLM:** GPT-4o class, chosen for tool-calling reliability. The faster options (4.1-mini, Groq) are a later swap once the behavior is verified, since here tool-calling accuracy matters more than speed.

---

## Constraints

### The grounding rules (non-negotiable, this is the whole point)

- **No unfiltered query path exists.** `lookup_part` is the only retrieval tool, and it cannot run without year+make+model. Do not add a second, looser search tool "for convenience."
- **No answers from model knowledge.** The agent never states a part, price, stock level, or fitment that did not come back from `lookup_part`. If the tool did not return it, the agent does not know it. Put this in the system prompt and rely on the single-tool design to back it up.
- **Never pick among multiple results.** More than one match means ask, never choose.
- **Never trust raw top ranking for dead parts.** Drop `stock=0` source parts and follow `superseded_by` to the current part, as described above.
- **Empty filtered result is the only "not carried" signal.** Do not interpret low scores, high scores, or anything else as "we don't have it."

### Out of scope for step 4 (do not build)

- Transfer-to-human and set-aside-by-name. Those are the next spec. For now, if a caller asks for something out of lane (modifications, interchange, returns, fleet pricing), the agent stays in the part-lookup lane and does not attempt those flows.
- Mid-year-split / production-date filtering. Deferred by decision. Do **not** put date-split parts in the seed catalog for this step.
- Multi-part calls, ordering, payments, order status.
- Call-log database and the `/calls` page (step 5).
- The formal held-out eval scenarios (step 6). Keep them out of the repo and away from the coding agent during this build. Task 5 below uses ad-hoc checks, not the held-out set.
- Telephony, auth, public deploy.

### Build constraints

- Reuse `moss-test/seed.py` and `query.py` as the Moss reference. Do not invent Moss API calls or swap in another vector database.
- Keep the step-3 LiveKit 1.x `AgentSession`. Add the LLM and the function tool to the existing session. Do not revert to `VoicePipelineAgent` or `MultimodalAgent`.
- Libraries: add the LiveKit `openai` plugin for the LLM. Do not add another agent framework.
- Keys in `.env` (gitignored) with `.env.example`. Add the OpenAI (or Groq) key and set its spend cap before the first LLM-backed call.

---

## Tasks

Ordered so dependencies come first. Note the deliberate shape: the tool (Task 2) is fully testable in plain Python before any voice is involved, exactly like the agent was testable before the UI in step 3.

### Task 1 — Promote the demo catalog with the required trap cases

- **Build:** Extend the tested mini-catalog into the demo catalog and seed it to the Moss index the agent will use. It must contain: a dual-engine vehicle whose part splits by engine (the 2.5 / 3.6 belt), a superseded part with a live replacement (A-100 to A-100B), a universal-fit part, ordinary single-match parts, and at least one vehicle that is *absent* so the RAV4-style no-match can be exercised. Do **not** include mid-year-split parts.
- **Files:** catalog JSON in repo, `moss-test/seed.py` (extended).
- **Verify:** Re-run the seed, then drive `query.py` to confirm each trap: dual-engine returns two close results, the absent vehicle returns zero under a vehicle filter, the superseded part and its replacement both exist and are linked.

### Task 2 — Build `lookup_part` as a standalone tool (no voice yet)

- **Build:** The `lookup_part` function and its internal `get_stock` helper, exactly as described in What. Mandatory vehicle args, filtered query, dead/superseded handling, stock+price attach, and the four-way discriminated result.
- **Files:** `/agent/tools/lookup_part.py`, small stock helper (same file or `/agent/tools/stock.py`).
- **Verify:** Drive the function directly from a CLI or test script against the seeded index. Confirm: dual-engine input returns `ambiguous` with `engine` and `["2.5","3.6"]`; the absent vehicle returns `no_match`; asking for A-100 returns `superseded` carrying A-100B plus its price and stock; a normal part returns `single_match` with price and stock. This is the heart of the step and it passes or fails without voice.

### Task 3 — Wire the LLM and tool into the AgentSession

- **Build:** Add the GPT-4o-class LLM to the step-3 session, register `lookup_part` as its only function tool, and write the system prompt encoding grounded-only, exact-match-or-ask, the vehicle read-back, disambiguation-by-differing-attribute, the superseded phrasing, hedged stock, and the no-match phrasing. Store the captured vehicle in session state.
- **Files:** `/agent/main.py` (evolved from step 3), `/agent/prompts.py`.
- **Verify:** Using console mode or the Playground, run the four scenarios and confirm the *spoken* behavior matches each branch: single quote with hedged stock, the disambiguation ask, the superseded tell-then-quote, and the clean no-match refusal.

### Task 4 — Harden the disambiguation loop

- **Build:** Make the ask, re-call, resolve loop reliable: on `ambiguous`, the agent asks about the differing attribute, waits for the answer, calls `lookup_part` again with that attribute added, and quotes the now-single result.
- **Files:** `/agent/main.py`, `/agent/prompts.py`.
- **Verify:** Run the dual-engine scenario end to end by voice. The agent asks "2.5 or 3.6?", takes the answer, resolves to one part, and quotes it. It never picks an engine on its own.

### Task 5 — Grounding and refusal verification pass

- **Build:** No new feature. Try hard to make the agent answer ungrounded, and tighten the prompt only if something leaks.
- **Files:** none, or minor prompt edits.
- **Verify:** The absent-vehicle call refuses to offer any part and says the no-match line. A fitment request with no vehicle given makes the agent ask for the vehicle rather than guess. A world-knowledge question it cannot ground (for example an oil-capacity question) is not answered from the model's own knowledge. Confirm no unfiltered fallback ever fires under any of these.

---

## Definition of done

Running by voice against the seeded catalog, the agent:

1. Always establishes and reads back the vehicle before quoting anything.
2. Quotes single matches with hedged stock and a price that came from the tool.
3. Asks "2.5 or 3.6?" on the dual-engine case and resolves it from the caller's answer.
4. Tells the caller a discontinued part was replaced, then quotes the replacement.
5. Says "we don't carry a match for that vehicle" for the absent vehicle, and never offers a wrong part.
6. Cannot be led into stating a part, price, stock, or fitment that did not come from `lookup_part`.

When all six hold, the retrieval brain is done and the agent is ready for the transfer-and-set-aside layer (next spec) and then the call log (step 5).