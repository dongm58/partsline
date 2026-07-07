# AGENTS.md — rules for coding agents in this repo

Project: PartsLine
Purpose: A browser-based voice agent for auto parts counters that answers fitment, price, stock, set-aside, and transfer questions for demo users now and real shops later.
Unusual: Never quote fitment from unfiltered semantic search; vehicle metadata filters are mandatory before any parts answer.

## Where things live
- The current plan is in `spec.md`. Read it before implementing anything. Implement ONE task at a time — never the whole spec in one pass.
- All commands (test, lint, typecheck, run) are in `COMMANDS.md`. Use those exact commands; do not invent alternatives.
- Project-specific review checks are in `review.md`.

## How to work
- Use test-driven development: write a failing test first, run it and confirm it fails, then write the minimum code to make it pass, then simplify.
- Run the full test suite plus lint and typecheck (see `COMMANDS.md`) before declaring any task done.
- Show evidence: paste the actual command you ran and its output. Never assert success without it.
- If anything in the task is ambiguous, ask before writing code. Do not guess.
- Stay inside the task's scope. Do not refactor, rename, or "improve" code the task doesn't touch.

## Hard constraints

### Dependencies (slopsquatting defense)
- Never add a new dependency without asking me first, and never run an install command on your own.
- When you propose a package, state its exact name and STOP for my approval. I will verify it exists on the official registry, has real download history, and isn't brand-new — because AI-suggested package names are sometimes hallucinated, and attackers register those fake names with malware.
- If you're unsure a package exists, say so. Never invent a package name to fill a gap.
- Pin versions in the lockfile. Do not silently upgrade or add transitive dependencies.

### Secrets
- Never put API keys, passwords, tokens, or database URLs directly in code or in any file that gets committed.
- Secrets live only in a `.env` file, and `.env` must be listed in `.gitignore`.
- Never print secrets in logs, error messages, or test output.
- If you ever notice a secret has been committed, stop and tell me immediately so I can revoke it.

### Other
- Tests run against the same database engine as production (see `COMMANDS.md`). Never substitute SQLite for convenience.
- Never touch production: no deploys, no production database access, no destructive operations without my explicit go-ahead.
- Never force-push, never rewrite published history, never delete branches you didn't create.

## Git
- One task = one commit. Small commits, imperative messages ("Add session expiry check"), reference the spec task ID (e.g. "T3:").
- Work on a feature branch; never commit directly to main.
- Use the `gh` CLI for all GitHub operations (PRs, comments, merges).
- When fixing PR review findings: only fix issues you agree need resolving — if you disagree, say why. Reply to each review comment stating what changed and where.

# Metered-resource safety (MANDATORY — added after an incident where a
## left-running dev session burned 817 voice minutes against a
## 60-minute provider quota)

1. UNBOUNDED-EXECUTION RULE: never write, wire, or leave in place any
   session, loop, worker, connection, or scheduled process that can run
   indefinitely against a metered external service (voice minutes, LLM
   tokens, STT/TTS, vector DB queries). Everything that consumes a
   metered resource must have BOTH an inactivity timeout and a hard
   maximum lifetime, with defaults that cannot be disabled (missing,
   zero, or negative config must fall back to a safe default, never to
   "unlimited").

2. PROTECTED MODULE: agent/session_limits.py and
   tests/test_session_limits.py implement this protection for voice
   sessions. Never remove, weaken, bypass, or add exceptions to them.
   Never add an agent-activity reset hook (agent speech must not keep a
   session alive). If a task appears to require changing them, STOP and
   ask before touching anything.

3. NEW METERED INTEGRATIONS: when adding any new external service that
   bills per-use, the FIRST task is the bounding mechanism (timeout,
   cap, or budget guard) plus a test proving it fires — before the
   feature that uses the service.

4. TEST HYGIENE: any test or script that opens a live session against
   a metered service must close/disconnect it in teardown, even on
   failure. Never leave a connection open "for the next test."

5. AT SESSION END: if you started any long-running process (worker,
   dev server, agent) during a task, say so explicitly in your final
   summary so the human knows what's still running and must be killed.