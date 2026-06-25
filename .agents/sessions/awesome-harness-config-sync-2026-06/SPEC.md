# P1.15 — Tool-config-sync + CI wiring + .bun-install skip

## Goals

1. Ship `scripts/sync-agent-config.ts` — a config-sync checker that detects when the 4 canonical agent-config files (`AGENTS.md`, `common/knowledge.md`, `cli/knowledge.md`, `.github/knowledge.md`) disagree with each other or with repo structure, and emits a human-readable sync prompt.
2. Add `.bun-install` to `SKIP_DIRECTORIES` in `scripts/memory-drift-guard.ts` (documented P1.14 follow-up — clears `.bun-install/install/cache/` broken-link noise).
3. Wire the memory-drift guard and the new sync-agent-config checker into CI (`.github/workflows/ci.yml`).

## Non-goals

- Do NOT add semantic NLP-based knowledge-file disagreement detection. Mechanical cross-reference + structural consistency only.
- Do NOT replace or duplicate the existing `checkToolConfigSync` / `checkBrokenLink` checkers in `memory-drift-guard.ts`. The new script is scoped to the 4 canonical config files and emits a richer sync prompt (actionable instructions), not generic findings.
- Do NOT auto-repair. This is a detection + prompt tool; the operator applies the fix.

## Requirements / acceptance criteria

- `scripts/sync-agent-config.ts` exists, is typecheck-clean, and has a CLI entrypoint (`guard:sync-agent-config` in `scripts/package.json`).
- Running `bun run --cwd=scripts guard:sync-agent-config` against the real repo exits 0 (or exits 1 with a sync prompt if the repo is actually out of sync).
- The checker validates:
  - All 4 canonical config files exist.
  - `AGENTS.md` "Repo Map" section — every backtick-quoted directory path exists on disk.
  - `AGENTS.md` "Docs" section — every `docs/...md` reference exists.
  - `cli/knowledge.md` — backtick-quoted relative file references (e.g. `scripts/tmux/README.md`, `cli/tmux.knowledge.md`, `docs/testing.md`) exist.
- A test file `scripts/__tests__/sync-agent-config.test.ts` covers: missing canonical file, missing repo-map dir, missing doc reference, missing cli/knowledge.md reference, and the all-clean path.
- `.bun-install` added to `SKIP_DIRECTORIES` in `scripts/memory-drift-guard.ts`; a regression test confirms `.bun-install/install/cache/foo.md` is skipped.
- `.github/workflows/ci.yml` gains a "Memory drift + config sync" step in the `build-and-check` job that runs both guards and fails the build on drift.
- `bun --cwd=scripts run typecheck` exits 0.
- `bun test scripts/__tests__/sync-agent-config.test.ts scripts/__tests__/memory-drift-guard.test.ts` passes.

## Relevant systems

- `scripts/memory-drift-guard.ts` — existing 11-checker drift suite; this PR extends `SKIP_DIRECTORIES`.
- `scripts/package.json` — script entrypoints.
- `.github/workflows/ci.yml` — CI pipeline; `build-and-check` job is the insertion point.
- `AGENTS.md`, `common/knowledge.md`, `cli/knowledge.md`, `.github/knowledge.md` — the 4 canonical config files the new checker validates.