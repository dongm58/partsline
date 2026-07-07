# PartsLine — Spec: Step 3, Voice Loop (Echo Agent)

**Goal of this step:** prove the browser-to-agent voice round-trip and the turn-taking feel work in isolation, before any Moss retrieval is wired in. When this is done, any voice bug is clearly in "the phone," not "the brain."

**Assumed repo layout:** Next.js app at repo root, Python agent in `/agent`. Adjust paths if yours differs, but keep web and agent code separated.

---

## Build orchestration

For running this alongside other coding agents.

- **Depends on:** nothing hard. This step is the foundation. It creates the AgentSession, the token endpoint, and the bare test page that everything later builds on. Do it first.
- **Owns (safe to edit freely):** `/agent/main.py` (creates it), `/app/api/token/route.ts`, `/app/voice-test/page.tsx`, `.env`, `.env.example`.
- **Shared files:** none to append to yet. This step *creates* `main.py`, which every later step appends to. So nothing else should touch `main.py` until this is merged.
- **Parallel-safe within this step:** the Python agent (Task 2) and the web side (token endpoint + test page, Tasks 3-4) are the web/agent seam. Two agents can build them at once *if* the room/token contract below is fixed first.
- **Freeze first:** the LiveKit version pin (`livekit-agents>=1.5`, AgentSession, not the deprecated classes) and the room/token contract (room name + participant identity the token grants).

---

## Why

Steps 4+ wire the parts brain (Moss retrieval, disambiguation, the four hard rules) onto a voice loop. If voice and retrieval are built together, a failure could live in either and you can't tell which. So this step builds and de-risks the voice transport, turn detection, and speech I/O on their own.

Two things make this domain's voice loop riskier than a generic chatbot, and this step targets both:

1. **Callers speak alphanumerics.** Engine sizes ("two point five"), part numbers, and trims. Speech-to-text accuracy on numbers, and turn detection that doesn't cut the caller off mid-number, are the real risks. A generic "hello world" agent won't surface them.
2. **Turn-taking has to feel human.** This connects to open question #2 in PROJECT.md (how many re-asks are acceptable). We want to feel the turn-taking now, cheaply, before retrieval latency is layered on top.

The echo behavior is chosen specifically so you can *hear* whether the agent caught "2.5" versus "3.6," which is exactly the failure mode step 4 depends on not happening.

---

## What

### Behavior (the full flow)

1. User opens a bare test page at `/voice-test` and clicks one connect/talk button. That click also serves as the browser audio-unlock gesture and triggers the mic-permission prompt.
2. The browser joins a LiveKit Cloud room using a short-lived token minted by a Next.js API route.
3. A Python agent worker (registered with LiveKit Cloud) is dispatched into the room.
4. On connect, the agent speaks first: **"Parts counter, go ahead."**
5. The caller speaks. Deepgram Nova-3 streaming STT transcribes.
6. LiveKit's semantic turn-detection model decides when the caller is actually finished (not raw silence).
7. The agent speaks the transcript back verbatim via Cartesia Sonic-3 TTS, prefixed so the echo is obvious: **"I heard: {transcript}."**
8. If the caller talks while the agent is speaking, the agent stops and listens (barge-in).
9. The bare page shows a minimal live transcript on screen, so STT output can be checked by eye as well as by ear.

There is **no LLM** in this loop. The echo is driven off the final-user-transcript event and sent straight to TTS via the session's speak method. This is deliberate: an LLM would add latency and cost and could reword the caller's input, which defeats the point of verifying STT verbatim.

### Numbers and formats that matter

- **Greeting text:** exactly `Parts counter, go ahead.`
- **Echo format:** exactly `I heard: {verbatim transcript}.` — do not clean up, re-punctuate, or normalize the transcript.
- **Models:** Deepgram Nova-3 (STT), Cartesia Sonic-3 (TTS). No LLM.
- **Latency target for this step:** first audio back within ~1.5s of the caller finishing; up to ~2s is acceptable as a pass. The production direction for a streamed cascade is ~400-600ms, but that is not a step-3 gate.
- **Turn detection / endpointing:** a pause *inside* a number or part code (for example a beat between "two point five" and "liter") must not trigger the agent to take its turn. Endpointing patience is tuned for this in Task 6.
- **Barge-in:** caller speech during agent TTS stops the agent within ~300ms.
- **Room model:** one ephemeral room per session; room is fine to auto-close when the participant leaves.

---

## Constraints

### Framework and version (the important one)

- Use **LiveKit Agents for Python, 1.x**, built around the **`AgentSession`** primitive. Pin `livekit-agents>=1.5`.
- **Do NOT use `VoicePipelineAgent` or `MultimodalAgent`.** Those are the pre-1.0 (0.x) abstractions and were collapsed into `AgentSession` at the 1.0 release. Any snippet, tutorial, or generated code that references them is out of date and will not run against a current install. If you see those class names, treat it as a signal the source is stale.
- Verify every method, event, and plugin name against the current docs at `docs.livekit.io/agents` before finalizing. Do not trust method names from memory or from older examples.

### Out of scope for step 3 (do not build)

- Moss, the parts catalog, retrieval, filtering, disambiguation, superseded-part handling, the four hard rules. All step 4.
- Any LLM stage or function tools.
- Call-log database and the `/calls` page. Step 5.
- Held-out eval scenarios. Step 6.
- SIP, telephony, phone numbers, callback capture. Browser WebRTC only.
- Auth, multi-tenancy, public deployment.
- The real demo page. This step uses a separate `/voice-test` route; merging into the main page happens later.

### Libraries

- Agent side: `livekit-agents` plus the `deepgram`, `cartesia`, `turn-detector`, and `silero` LiveKit plugins. Nothing else.
- Web side: Next.js with `livekit-client` and `@livekit/components-react`.
- Do **not** add Pipecat, Vapi, Retell, or any other voice framework.
- Do **not** add an LLM SDK yet.

### Security

- All keys in `.env` (gitignored) with a committed `.env.example`. Repo is public from day one, so no key ever lands in a commit.
- Spend caps and alerts on LiveKit, Deepgram, and Cartesia accounts, set on day one, before the first live call.

---

## Tasks

Ordered so dependencies come first. Each task should be verifiable on its own before moving on.

### Task 1 — Accounts, keys, spend caps

- **Build:** Create a LiveKit Cloud project (free tier). Get API key/secret and the project URL. Get Deepgram and Cartesia API keys. Set a spend cap and alert on each of the three dashboards.
- **Files:** `.env` (gitignored), `.env.example` (committed, keys blank), `.gitignore`.
- **Verify:** `.env` loads in a throwaway script; each of the three provider dashboards shows an active spend cap. Confirm `.env` is gitignored (`git status` shows it untracked).

### Task 2 — Agent worker: echo, no LLM (verify before any custom UI)

- **Build:** A Python agent worker that registers with LiveKit Cloud and, when dispatched into a room, starts an `AgentSession` configured with: Deepgram Nova-3 STT, Cartesia Sonic-3 TTS, the LiveKit semantic turn-detection model, Silero VAD, and barge-in enabled. On connect it speaks the greeting. It subscribes to the final-user-transcript event and speaks `I heard: {transcript}.` back through TTS. No LLM is configured on the session.
- **Files:** `/agent/main.py`, `/agent/pyproject.toml` (or `requirements.txt`).
- **Verify:** Run the worker and talk to it using the built-in **console mode** (mic straight from your terminal) or the hosted **Agents Playground** — no custom frontend needed yet. Say "two point five liter." Confirm you hear the greeting on connect, hear "I heard: two point five liter," and that it does not cut you off. This isolates the voice proof exactly as intended.

### Task 3 — Token endpoint

- **Build:** A Next.js API route that mints a short-lived LiveKit access token for a browser client to join a room (room name + participant identity).
- **Files:** `/app/api/token/route.ts`.
- **Verify:** Call the route; it returns a JWT. Decode it and confirm the room grant and identity are correct and the expiry is short.

### Task 4 — Bare test page

- **Build:** A `/voice-test` route with a single connect/talk button. The button handles mic permission and browser audio unlock, fetches a token from Task 3, and joins the LiveKit room. Render a minimal on-screen live transcript. No styling beyond what's needed to read the transcript and click the button.
- **Files:** `/app/voice-test/page.tsx` plus any small client component for the LiveKit connection.
- **Verify:** Click connect. Browser joins the room and you hear the greeting through your speakers. The transcript area updates as you speak.

### Task 5 — End-to-end verification

- **Build:** Nothing new; wire Tasks 2-4 together and run the full path (browser -> LiveKit Cloud -> agent -> back).
- **Files:** none (integration only).
- **Verify:** Against the Definition of Done below.

### Task 6 — Turn-detection and endpointing tuning for numbers

- **Build:** Adjust endpointing patience (min/max endpointing delay) so a pause inside a spoken number or part code does not trigger the agent to take its turn. Leave barge-in on.
- **Files:** `/agent/main.py`.
- **Verify:** Read a fake part number aloud slowly with a deliberate mid-number pause (for example "A dash one hundred ... B"). The agent waits for you to finish instead of jumping in. Repeat with "two point five ... liter."

---

## Definition of done

You click the talk button, say a sentence with a number in it, and:

1. You hear the greeting on connect.
2. You hear the sentence echoed back within ~1-2 seconds.
3. The echo shows the number was heard correctly (by ear and in the on-screen transcript).
4. It does not cut you off mid-sentence or mid-number.
5. You can talk over it and it stops to listen.

When all five hold, step 3 is done and the loop is ready for the parts brain in step 4.