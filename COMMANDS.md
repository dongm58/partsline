# COMMANDS.md — exact commands for this repo (Python + TypeScript stack)

## Test
- Python all tests: `pytest`
- Python one file: `pytest tests/test_<name>.py -v`
- TypeScript all tests: `npm test`
- TypeScript one file: `npm test -- tests/<name>.test.ts`
- Call-log tests use the same database engine as production. For v1 this is SQLite, with the test database URL/path from `.env.test`.

## Quality gates (all must pass before "done")
- Python lint: `ruff check .`
- Python format: `ruff format .`
- Python types: `mypy .`
- TypeScript lint: `npm run lint`
- TypeScript format: `npm run format`
- TypeScript types: `npm run typecheck`

## Run
- Python voice agent: `python agent.py`
- Next.js app: `npm run dev`
- Seed Moss catalog: `python seed.py`
- Query Moss catalog: `python query.py`

## Definition of done
New test(s) pass + full suite passes + all gates pass + agent showed the output.
