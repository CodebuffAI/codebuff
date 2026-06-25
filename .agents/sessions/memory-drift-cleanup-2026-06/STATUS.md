# Memory drift cleanup — STATUS

## Current phase
complete — awaiting reviewer gate

## Baseline
`bun --cwd=scripts run guard:memory-drift` → exit 1, 104 findings:
- path (11), command (49), script-coverage (36), todo-fixme (7), broken-link (1)

## Final state
`bun --cwd=scripts run guard:memory-drift` → exit 0, 0 findings across 11 checkers.
CI `guard:memory-drift` promoted to blocking gate.

## Milestone progress
- [x] M1 — Fix `command` checker regex + cwd inference
  - [x] M1.1 Fix `COMMAND_REGEX` (--cwd before OR after `run`) (49→32)
  - [x] M1.2 Fix `checkCommand` cwd inference (cd prefix, nearest pkg ancestor, root fallback)
  - [x] M1.3 Skip flag fragments, file-path fragments, out-of-repo --cwd/cd paths (32→12)
  - [x] M1.4 Multi-line `cd <dir>` prefix inference (CONTRIBUTING.md:121)
  - [x] M1.5 Regression tests (10 new command/allowlist tests; 25 pass total)
- [x] M2 — Fix `script-coverage` checker (scripts/.coverage-allow allowlist; 29→0)
- [x] M3 — Fix 11 `path` findings (stale backtick-quoted paths in docs/patterns)
- [x] M4 — Fix `todo-fixme` findings
  - [x] M4a Guard fix: require `:` or `(` after marker (skip "TODO List" feature names)
  - [x] M4b Annotate 3 genuine TODOs with `<!-- allow-todo -->`
- [x] M5 — Fix `broken-link` finding
  - [x] M5a Guard fix: strip `#anchor` fragment before existsSync
- [x] M6 — Fix remaining `command` findings (stale script names in docs: build/start→prebuild, test:unit:e2e→test, smoke-test→smoke, db-start→--cwd packages/internal)
- [x] M7 — Final validation + promote CI to blocking
  - [x] M7a Regression tests for M4a/M5 guard fixes (3 new tests)
  - [x] M7b typecheck exit 0, guard exit 0, CI promoted to blocking gate
  - [x] M7c STATUS.md/LESSONS.md updated + reviewer gate

## Validation
- `bun --cwd=scripts run typecheck` → exit 0
- `bun test scripts/__tests__/memory-drift-guard.test.ts` → 25 pass, 0 fail
- `bun --cwd=scripts run guard:memory-drift` → exit 0, 0 findings
- `bun --cwd=scripts run guard:sync-agent-config` → exit 0

## Next checkpoint
Reviewer gate on the full file set; on LOOKS_GOOD, session is complete.
