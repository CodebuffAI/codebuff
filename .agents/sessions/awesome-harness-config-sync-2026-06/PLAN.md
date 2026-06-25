# P1.15 — Tool-config-sync + CI wiring + .bun-install skip

## Milestones

1. **Bootstrap artifacts** — Create PLAN.md, STATUS.md, LESSONS.md (this file).
2. **`.bun-install` skip** — Add `.bun-install` to `SKIP_DIRECTORIES` in `scripts/memory-drift-guard.ts`; add regression test in `scripts/__tests__/memory-drift-guard.test.ts` confirming `.bun-install/install/cache/foo.md` is skipped.
3. **`scripts/sync-agent-config.ts`** — New checker validating the 4 canonical config files (`AGENTS.md`, `common/knowledge.md`, `cli/knowledge.md`, `.github/knowledge.md`):
   - All 4 files exist.
   - `AGENTS.md` "Repo Map" section: backtick-quoted dir paths exist on disk.
   - `AGENTS.md` "Docs" section: `docs/...md` references exist.
   - `cli/knowledge.md`: backtick-quoted relative file references exist.
   - Emits a human-readable sync prompt (actionable instructions), exits 1 on drift, 0 when clean.
   - Mirrors `memory-drift-guard.ts` conventions: `projectRoot()`, `Finding` type, `import.meta.main` CLI entrypoint.
4. **`scripts/__tests__/sync-agent-config.test.ts`** — Tests: missing canonical file, missing repo-map dir, missing doc reference, missing cli/knowledge.md reference, all-clean path.
5. **`scripts/package.json`** — Add `"guard:sync-agent-config": "bun run sync-agent-config.ts"`.
6. **CI wiring** — Add "Memory drift + config sync" step to `build-and-check` job in `.github/workflows/ci.yml` running both guards; fail build on drift.
7. **Validation gate** — `bun --cwd=scripts run typecheck`; `bun test scripts/__tests__/sync-agent-config.test.ts scripts/__tests__/memory-drift-guard.test.ts`; run both guards against real repo.
8. **Finalize** — Update STATUS.md + LESSONS.md; add parent review session pointer.

## Key implementation details

### sync-agent-config.ts structure

```ts
// Mirrors memory-drift-guard.ts conventions
export type SyncFinding = { file: string; line: number; message: string }
export function checkCanonicalFilesExist(root): SyncFinding[]
export function checkAgentsRepoMap(root): SyncFinding[]
export function checkAgentsDocs(root): SyncFinding[]
export function checkCliKnowledgeRefs(root): SyncFinding[]
export function runSyncAgentConfig(root): { findings: SyncFinding[]; prompt: string }
// import.meta.main: print prompt, exit 1 if findings
```

### AGENTS.md parsing

- "Repo Map" section: find heading `## Repo Map`, scan bullet lines `- \`dirname\``, check `existsSync(join(root, dirname))`.
- "Docs" section: find heading `## Docs`, scan for `docs/...md` backtick-quoted or markdown links, check existence.

### cli/knowledge.md parsing

- Backtick-quoted relative paths (e.g. `scripts/tmux/README.md`, `cli/tmux.knowledge.md`, `docs/testing.md`) resolved relative to repo root. Use regex `` /`([^`]+\.[a-z]+)`/g `` and filter to paths containing `/` or known extensions.

### .bun-install skip

In `SKIP_DIRECTORIES` set in `scripts/memory-drift-guard.ts`, add `.bun-install`. The `markdownFiles` generator already skips directories in this set.

## Risks

- `cli/knowledge.md` has many backtick-quoted non-path tokens (e.g. `flexGrow`, `minWidth`). Filter to paths with `/` or `.md`/`.ts`/`.tsx` extension to avoid false positives.
- AGENTS.md "Docs" section references `docs/patterns/handle-steps-generators.md` — verify it exists before shipping; if missing, the checker correctly flags it (that's the intended behavior).
- CI step must run after `bun install` (guards need scripts package available).
