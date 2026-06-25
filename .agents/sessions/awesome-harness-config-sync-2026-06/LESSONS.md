# P1.15 — LESSONS

## Session bootstrap — 2026-06-23

- The `awesome-harness-config-sync-2026-06` session directory existed with only SPEC.md when resumed. PLAN.md and STATUS.md had to be bootstrapped before implementation could proceed.
- The SPEC is authoritative and complete; it defines the 4 canonical config files, the `.bun-install` skip, and the CI wiring scope.

<!-- update_plan_status:appended -->
## P1.15 wrap-up — 2026-06-23 — 2026-06-23T15:41:18.826Z

The config-sync batch shipped: `.bun-install` added to `SKIP_DIRECTORIES` (clears the documented P1.14 drift-guard noise), `scripts/sync-agent-config.ts` checker + 11 tests, `guard:sync-agent-config` npm script, CI step wired in `.github/workflows/ci.yml`, and 3 stale canonical-config references fixed (AGENTS.md `docs/patterns/` → `agents/patterns/`; cli/knowledge.md `use-message-renderer.ts` → `agent-branch-wrapper.tsx`; the third reference was corrected in the same transaction).

Reusable patterns:
- The `sync-agent-config` checker mirrors `byok-wording-guard.ts` conventions: canonical-file registry + regex-anchored path matching + tmpdir-isolated tests. The path regex must anchor with `\b` + top-level dir name AND require a trailing `/` (or end-of-word) to avoid false positives like `cli-args.test.ts` matching `cli/`.
- Canonical config files (AGENTS.md, cli/knowledge.md, common/knowledge.md, .github/knowledge.md) drift silently because nothing references them in CI. A dedicated checker is the right fix — not extending the memory-drift guard, which is already at 11 checkers.
- When a new guard finds real drift, fix the canonical config files in the same session so CI passes on day one; don't ship a guard that fails against the repo.
- `.bun-install/install/cache/` contains third-party package READMEs with broken links; it belongs in `SKIP_DIRECTORIES`, not in a per-checker allowlist.

Follow-ups queued (NON_BLOCKING):
- The remaining memory-drift findings (script-coverage noise for standalone scripts, 7 TODO/FIXME markers, 1 broken-link) are pre-existing and outside this session's scope. A future P1.16+ pass could address script-coverage and the TODO/FIXME markers.
- The `sync-agent-config` guard runs in CI alongside `guard:memory-drift` in a single "Memory drift + config sync" step. If drift is found, the step name in the CI log is the fastest way to identify which guard failed.

