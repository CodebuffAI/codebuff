# Memory drift cleanup — PLAN

## Milestones

### M1 — Fix `command` checker regex + cwd inference (improve-guard)
- [ ] M1.1 Fix `COMMAND_REGEX` to allow `--cwd` before OR after `run`, never capturing it as script name
- [ ] M1.2 Fix `checkCommand` cwd inference: (a) `cd <dir> &&` prefix, (b) nearest `package.json` ancestor of markdown file, (c) root fallback
- [ ] M1.3 Update `scripts/__tests__/memory-drift-guard.test.ts` with regression tests for both bugs
- [ ] M1.4 Validate: `bun test scripts/__tests__/memory-drift-guard.test.ts` + `bun --cwd=scripts run guard:memory-drift` (command findings → 0 or near-0)

### M2 — Fix `script-coverage` checker (improve-guard)
- [ ] M2.1 Change `checkScriptCoverage` to also check if script is imported/referenced by any `.ts` file in repo
- [ ] M2.2 If residual findings remain, create `scripts/.coverage-allow` allowlist for known utility scripts
- [ ] M2.3 Validate: `guard:memory-drift` script-coverage findings → 0

### M3 — Fix `path` findings (fix-source, 11 findings)
- [ ] M3.1 `agents/patterns/extend-the-sdk.md:34` — fix or verify `provider-options-metadata.test.ts` path
- [ ] M3.2 `packages/agent-runtime/src/templates/README.md:142` — fix or remove `agent-overrides.ts` reference
- [ ] M3.3 `docs/codebuff-to-openbuff-migration.md:202,203` — replace deleted CLI file refs
- [ ] M3.4 `docs/architecture.md:39,51,62` — rephrase conceptual `src/*.tsx` examples to avoid backtick-quoted paths
- [ ] M3.5 Validate: `guard:memory-drift` path findings → 0

### M4 — Fix `todo-fixme` findings (fix-source, 7 findings)
- [ ] M4.1 `cli/knowledge.md:289,300,305` — resolve or annotate
- [ ] M4.2 `docs/codebuff-to-openbuff-migration.md:103,249,293` — resolve or annotate
- [ ] M4.3 `scripts/ft-file-selection/README.md:49` — resolve or annotate
- [ ] M4.4 Validate: `guard:memory-drift` todo-fixme findings → 0

### M5 — Fix `broken-link` finding (fix-source, 1 finding)
- [ ] M5.1 `docs/architecture.md:161` — fix `./request-flow.md#reviewer--validation-gate-semantics` anchor
- [ ] M5.2 Validate: `guard:memory-drift` broken-link findings → 0

### M6 — Final validation + promote CI to blocking
- [ ] M6.1 `bun --cwd=scripts run guard:memory-drift` → exit 0 (0 findings)
- [ ] M6.2 `bun --cwd=scripts run typecheck` → exit 0
- [ ] M6.3 `bun test scripts/__tests__/memory-drift-guard.test.ts` → pass
- [ ] M6.4 Remove `|| echo "::warning::..."` non-blocking wrapper in `.github/workflows/ci.yml` so `guard:memory-drift` is blocking
- [ ] M6.5 Reviewer gate → LOOKS_GOOD

## Dependencies
- M1, M2 are guard-improvement (code changes to `scripts/memory-drift-guard.ts` + tests)
- M3, M4, M5 are source fixes (docs/markdown edits), independent of each other
- M6 depends on M1–M5 all complete
- M1.3/M2.2 tests must pass before M6.2 typecheck

## Risks
- `checkCommand` cwd inference by nearest `package.json` ancestor could over-correct (a README in `docs/` has no package.json ancestor except root — correct). Must verify subdir READMEs (`cli/`, `sdk/`, `evals/`) actually have matching scripts in their local `package.json`.
- `script-coverage` import-reference scan could be slow if scanning all `.ts` files; limit to `scripts/` + root-level imports.
- `docs/architecture.md` `src/*.tsx` may be intentional conceptual examples — rephrasing must preserve meaning.
