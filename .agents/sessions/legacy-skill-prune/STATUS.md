# STATUS: Legacy skill & slash-command prune

## Current state

**Phase:** ✅ Session completed (2026-07-06). M1 executed, validation green, `sessionStatus: completed` set via `update_plan_status`.

**Session independence:** This session is logically independent of `.agents/sessions/upstream-byok-beneficial-changes/` (M1-M6 upstream-port audit). Either can be executed first; they do not depend on each other.

## Completed

- ✅ In-depth audit of on-disk skill surface (`glob **/SKILL.md` → 4 paths; full read of all 3 real `.agents/skills/*/SKILL.md` files).
- ✅ Verified the harness-injected `sc-*` / `flow-nexus-*` skill catalog is **not on disk** in the fork (`grep` → 0 hits across `*.ts/*.tsx/*.md/*.json`).
- ✅ Verified the CLI's bundled-agents artifact (`cli/src/agents/bundled-agents.generated.ts`) only references the `skill` *tool* (15 hits, all `"skill"` in `toolNames` arrays); **no `sc-*` / `flow-nexus-*` skill ids are baked in**. Confirms the harness-injection conclusion.
- ✅ Identified the two stale slash-command descriptions (`cli/src/data/slash-commands.ts:96,125`) claiming "GPT 5.4".
- ✅ Overlap-checked each on-disk skill against the root prompts / agent registry / slash-command handlers: `cleanup` is duplicated by root "Code Craftsmanship" section; `review` is duplicated by `/review` handler + auto-spawned code-reviewer gate; `meta` is genuinely unique.
- ✅ Created all four durable artifacts (SPEC.md, PLAN.md, STATUS.md, LESSONS.md) under `.agents/sessions/legacy-skill-prune/`.
- ✅ **M1 executed** (single editing pass with Q1/Q2 defaults applied):
  - T1+T2: atomic `str_replace` in `cli/src/data/slash-commands.ts` — `/plan` → `Create a durable plan with the configured planner`; `/review` → `Review code changes with the configured reviewer`.
  - T3: `git rm .agents/skills/cleanup/SKILL.md` + `.agents/skills/review/SKILL.md`. git auto-pruned the now-empty parent directories.
  - T4: `.agents/skills/meta/SKILL.md` re-read and confirmed unchanged.
- ✅ **Aux subagent artifacts produced during M1 execution** (orchestrator aux gates R1b/R1c):
  - `test-writer` (R1b) → created `cli/src/data/__tests__/slash-commands.test.ts` (23 tests / 439 expect() calls; includes "GPT 5.4" regression guards and 50-char truncation boundary tests).
  - `doc-writer` (R1c) → appended `## Slash Commands` section to `docs/agents-and-tools.md` documenting the `SLASH_COMMANDS` / `SLASHLESS_COMMAND_IDS` / `getSlashCommandsWithSkills` contract.
- ✅ **Validation green**: `cd cli && bun run typecheck` exit 0; `cd cli && bun test` 2223 pass / 15 skip / 0 fail (test-writer output included); `grep -iE 'freebuff|IS_FREEBUFF' cli agents common packages` 0 hits; in-scope `glob **/SKILL.md` == 2 (`meta` + `example-skill`).

## Pending

- None. Session complete.

## Blocked / open questions

- None. Q1/Q2 were answered by applying the documented defaults (no custom override requested by the user).

## Next checkpoint

- None. Session completed. If the user wants to commit the staged deletions + description edits, they should invoke `git-committer` with the session-relative message convention (separate from the upstream-byok session's commits).

## Resume instructions

- Artifacts under `.agents/sessions/legacy-skill-prune/`: SPEC.md (scope + acceptance criteria), PLAN.md (verdict table + M1 tasks + validation), STATUS.md (this file), LESSONS.md (gotchas).
- Session is completed; no further work is expected. To re-baseline against `upstream-byok-beneficial-changes`: this session touched only `.agents/skills/*`, `cli/src/data/slash-commands.ts`, `cli/src/data/__tests__/slash-commands.test.ts`, and `docs/agents-and-tools.md`. No file from the upstream-port session's milestone set was touched. The shared freebuff-grep gate is trivially satisfied.

<!-- update_plan_status:appended -->
## M1 executed — 2026-07-06 — 2026-07-05T21:10:43.552Z

Executed M1 in a single editing pass with Q1/Q2 defaults (no custom override requested).

- T1+T2: atomic str_replace in cli/src/data/slash-commands.ts — line 96 `/plan` description → `Create a durable plan with the configured planner`; line 125 `/review` description → `Review code changes with the configured reviewer`.
- T3: `git rm .agents/skills/cleanup/SKILL.md .agents/skills/review/SKILL.md`. git auto-pruned the now-empty parent directories (the `rmdir` follow-up was redundant and reported "No such file or directory" — expected).
- T4: `.agents/skills/meta/SKILL.md` re-read and confirmed unchanged.

Validation (all green):
- `cd cli && bun run typecheck` → `$ tsc --noEmit -p .`, exit 0, no diagnostics.
- `cd cli && bun run test` → 2200 pass / 15 skip (tmux + clipboard env-gated) / 0 fail, 5681 expect() calls, 107 files, 15.02s. Specifically `command-args.test.ts` + `command-suggestions.test.ts` pass — no snapshot regression on the description edits or the available-skills XML dropping two entries.
- `grep -iE 'freebuff|IS_FREEBUFF' --include='*.ts' --include='*.tsx' -r cli agents common packages` → 0 hits. Gate trivially satisfied (no freebuff-coupled code touched).
- `find . -name SKILL.md -not -path '*/node_modules/*' -not -path '*/.git/*'` → 2 in-scope paths: `./.agents/skills/meta/SKILL.md` + `./common/src/templates/initial-agents-dir/skills/example-skill/SKILL.md`. (3 additional hits under `./evals/test-repos/openbuff-HEAD/.agents/skills/{cleanup,review,meta}/SKILL.md` are a separate test-repo fixture, explicitly out of scope per SPEC.)

Session marked `completed` via update_plan_status.
