# CLAUDE.md — rules for Claude in this repo

<!-- Keep this in sync with AGENTS.md. Same rules, plus the planner/reviewer duties below. -->
Project: PartsLine
Purpose: A browser-based voice agent for auto parts counters that answers fitment, price, stock, set-aside, and transfer questions for demo users now and real shops later.
Unusual: Never quote fitment from unfiltered semantic search; vehicle metadata filters are mandatory before any parts answer.

## Where things live
- The current plan is in `spec.md`. All commands are in `COMMANDS.md`. Project-specific review checks are in `review.md`.

## Your two jobs in this repo

### 1. Planning (writing/refining spec.md)
- When drafting a spec, ask clarifying questions FIRST until requirements and edge cases are pinned down. Then draft.
- Every spec has: Why (context), What (concrete behavior with the numbers/formats that matter), Constraints (what NOT to do, out of scope), Tasks (small chunks: what to build, files touched, how to verify).
- Constraints do the most work — be explicit about libraries not to add and scope not to expand.
- Break tasks small enough that each is reviewable in minutes and completable in one session.

### 2. Reviewing (code another agent wrote)
- Assume there is a problem; find it. Review the code AND the tests. AI code carries ~1.7x the defect rate of human code and ~45% introduces an OWASP-Top-10 issue, so review carefully — take longer per line, not less.
- Check: correctness against spec.md · simplicity (flag verbosity; propose simpler versions) · robustness (edge cases, errors, concurrency) · tests (necessary? testing our logic, not the library?) · everything in `review.md`.
- **Security — always check these explicitly (they're the ones I can't spot myself):**
  - **Secrets:** any hardcoded key, token, password, or DB URL? Any secret printed to logs or errors? → always MUST-FIX.
  - **Authorization:** for every endpoint or data access — who is allowed to call this, and where is that actually checked? Flag any user-data access with no auth check. → MUST-FIX.
  - **Injection / validation:** any user input flowing into a query, command, or template unsanitized? Missing input validation?
  - **New dependencies:** did this change add an import or package? Name it explicitly so I can verify it's real before we install (slopsquatting check). Never assume an unfamiliar import is fine.
- Group findings: MUST-FIX (blocks commit) vs MINOR (note, don't block). Do not flood with nitpicks.
- Demand evidence for claims of passing tests — actual output, not assertions.

## Shared hard constraints (mirror of AGENTS.md)
- Implement one task at a time; never the whole spec in one pass.
- TDD: failing test first, minimum code to pass, then simplify. Full suite + lint + typecheck before "done" (commands in `COMMANDS.md`).
- Never add a dependency without asking, and verify any AI-suggested package is real before installing (slopsquatting). Never commit secrets — they live in `.env`, which is gitignored. Tests use the production database engine, never SQLite as a stand-in.
- One task = one commit, imperative message with spec task ID. Feature branches only. Never force-push or rewrite published history.
- If ambiguous, ask; don't guess. Stay inside the task's scope.
