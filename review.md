# review.md — project-specific review checks

<!--
The generic review (correctness / security / simplicity / robustness /
review-the-tests) lives in CLAUDE.md and always runs. THIS file is for
checks specific to THIS project — the things generic review can't know.

Start nearly empty. Every time a bug slips through to you or to
production, ask: "what check would have caught this?" — and add it here.
This file is your project's scar tissue. It should grow slowly and
never shrink.
-->

## Security baseline (keep these — they apply to every project)
- No hardcoded secrets, keys, tokens, or DB URLs. Secrets live in `.env` (gitignored). No secrets in logs or error output.
- Every endpoint / data access has an auth check — confirm WHO can call it and WHERE that's enforced.
- No user input flowing unsanitized into SQL, shell commands, or HTML/templates.
- Any newly added package is verified as a real, established registry package before install (slopsquatting).

## Backend & data security (esp. if using Supabase / Firebase / any direct-to-DB setup)
<!--
AI review reliably catches broken CODE. It does NOT reliably catch bad
DATA DESIGN or config. These are the ones that leaked real apps + caused
$10k+ bills. Some are YES/NO checks; the starred ones are questions only
YOU can answer because they're design judgment, not code.
-->
- **RLS / access rules configured?** If the frontend talks directly to the DB (Supabase/Firebase), Row Level Security must restrict each user to their OWN rows. Default-open = anyone can download the whole DB. Give the agent the Supabase/Firebase MCP or CLI so it audits the REAL config, not a screenshot.
- **★ Can a user edit any field that controls money, access, or limits?** (subscription status, is_premium, rate_limit, role, credits). If a user can edit their own row AND that row contains one of these fields, they can grant themselves premium / unlimited usage. **Never store user-editable data and privilege/billing data on the same editable row.** This is the #1 miss — RLS can be technically correct and still exploitable through data design.
- **Rate limits on the BACKEND, not the frontend.** Frontend limits are bypassable — anyone hits the backend endpoint directly. And don't store the limit values where the user can edit them.
- **Sensitive calls (Stripe, S3, email, AI providers) go through the backend, never the frontend.** A frontend call exposes the key.
- **Frontend/mobile env vars are NOT secret.** They can be extracted. Keys are only safe in a backend env. Flag any real key in frontend/mobile code even if it's "in an env var."

## Always check in this repo (add your project-specific ones)
- Fitment answers must always use vehicle metadata filters before quoting a part, price, stock, or availability.
- If filtered retrieval returns multiple plausible matches, the agent must ask a disambiguating question instead of picking one.
- If filtered retrieval returns zero matches, the agent must say there is no match for that vehicle and must not fall back to unfiltered semantic search.
- Superseded or zero-stock parts must be explicitly excluded, deprioritized, or resolved to the replacement before the caller hears an answer.
- Complex calls must transfer cheerfully with captured context: modifications, interchange questions, returns/warranty, and fleet/commercial pricing.
- Lookup chips/transcript UI must show the retrievals that actually fired, so the demo proves the answer is grounded.

## You-actions (things the agent can't do — YOU must)
- **Budget caps + spend alerts** on every paid provider (AI, cloud, DB). A cap means a leaked key or abuse takes the app DOWN instead of generating a $10k+ bill. If the provider has no hard cap, at minimum set alerts.
- **Adversarial security conversation before shipping anything with users/payments:** ask the agent specific attack scenarios, not "check my security." E.g. "Can a user bypass their subscription? Modify their rate limit? Read another user's data? Abuse this endpoint to run up cost?"

## Known footguns
- Semantic score is not a safe "we don't carry this" signal; absent vehicles can score highly without metadata filters.
- Discontinued parts can outrank their replacements on semantic similarity.
- Mid-year production-date filtering with real date metadata is unresolved; re-test `$lte`/`$gte` before building that feature.
- V1 is browser voice only and local demo only; phone telephony, payments, auth, public deployment, and real POS/catalog integrations are out of scope.

## Severity guidance for this project
<!-- What counts as must-fix HERE. e.g.: -->
- Anything touching auth, payments, or data deletion: must-fix threshold is LOW — flag aggressively.
- Styling/naming in prototype dirs: minor at most.
