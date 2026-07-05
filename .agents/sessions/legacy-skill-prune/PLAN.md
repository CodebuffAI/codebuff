# PLAN: Legacy skill & slash-command prune
<!-- current-task: none -->

## Context recap

- Single-milestone prune. Three tangible edits + two deletions + one sanity-keep.
- Session is **independent** of `.agents/sessions/upstream-byok-beneficial-changes/` and **must not** depend on any of its M1-M6 milestones.
- `freebuff` / `IS_FREEBUFF` grep gate inherited from that session; trivially satisfied.

## Verdict table — on-disk surface → disposition

| # | Item | File | Category | Disposition | Rationale |
|---|---|---|---|---|---|
| 1 | `/plan` description claims "GPT 5.4" | `cli/src/data/slash-commands.ts:96` | Stale copy | **EDIT** | Planner is model-agnostic under BYOK. Pure text fix. |
| 2 | `/review` description claims "GPT 5.4" | `cli/src/data/slash-commands.ts:125` | Stale copy | **EDIT** | Reviewer is model-agnostic; `code-reviewer` reviewer-gate + `/review` handler both already work independent of model. |
| 3 | `cleanup` skill content | `.agents/skills/cleanup/SKILL.md` | Vestigial skill | **DELETE** | Fully duplicated by root "Code Craftsmanship / Simplicity & Minimalism / Code Reuse" section every spawned agent inherits. |
| 4 | `review` skill content | `.agents/skills/review/SKILL.md` | Vestigial skill | **DELETE** | Fully duplicated by `/review` slash command handler + auto-spawned `code-reviewer` reviewer-gate after every edit. |
| 5 | `meta` skill content | `.agents/skills/meta/SKILL.md` | Surviving skill | **KEEP** | Not duplicated by any agent template. Genuinely valuable (SDK-eval persistence, `bun --cwd` invocation, structured-log debugging). |
| 6 | `example-skill` scaffold | `common/src/templates/initial-agents-dir/skills/example-skill/SKILL.md` | User scaffold | **KEEP** | Shipped intentionally for users learning the skill format. |
| 7 | `sc-*` / `flow-nexus-*` skill ids | (not on disk — harness-injected) | Out of scope | **NO-OP** | `grep` returns 0 hits in repo; not a fork-cleanable surface. Documented in LESSONS to prevent future re-investigation. |

## Milestones

### M1 — Slash-command description refresh + vestigial-skill deletion (single milestone)

- **Scope:**
  - `cli/src/data/slash-commands.ts` (lines 96 + 125 — two `description:` strings).
  - `.agents/skills/cleanup/SKILL.md` (delete).
  - `.agents/skills/review/SKILL.md` (delete).
  - `.agents/skills/meta/SKILL.md` (verify unchanged — no edit).
- **Tasks:**
  1. Edit `cli/src/data/slash-commands.ts:96` `description: 'Create a plan with GPT 5.4'` → `description: 'Create a durable plan with the configured planner'` (Q1 default).
  2. Edit `cli/src/data/slash-commands.ts:125` `description: 'Review code changes with GPT 5.4'` → `description: 'Review code changes with the configured reviewer'` (Q2 default).
  3. `git rm .agents/skills/cleanup/SKILL.md` and `git rm .agents/skills/review/SKILL.md` (or `rm` the files; the worktree untracked-status check confirms they are tracked). If the `.agents/skills/cleanup/` and `.agents/skills/review/` directories become empty after deletion, remove the empty directories too.
  4. Verify `.agents/skills/meta/SKILL.md` is unchanged.
- **Validation:**
  - `bun --cwd cli run typecheck` passes.
  - `bun --cwd cli run test` passes (specifically `command-args.test.ts` and `command-suggestions.test.ts`).
  - `grep -iE 'freebuff|IS_FREEBUFF' cli agents common packages` → zero new hits vs pre-edit baseline.
  - `glob **/SKILL.md` returns exactly 2 paths: `.agents/skills/meta/SKILL.md` + `common/src/templates/initial-agents-dir/skills/example-skill/SKILL.md`.
  - Manual: launch the CLI, open the command palette, confirm `/plan` and `/review` show the new descriptions and still work end-to-end.

## Task dependencies / ordering

- T1 + T2 are independent text edits inside the same file → batch them in a single `str_replace` call (two replacements, atomic).
- T3 (deletions) is independent of T1/T2 → can run in parallel.
- T4 (verify meta unchanged) is a no-op gate.
- Validation runs serially after all four tasks complete.

## Validation gates

1. `bun --cwd cli run typecheck` — typecheck the CLI package.
2. `bun --cwd cli run test` — CLI test suite, must include `command-args.test.ts` + `command-suggestions.test.ts`.
3. `grep -iE 'freebuff|IS_FREEBUFF' --include='*.ts' --include='*.tsx' cli agents common packages` → zero new hits vs pre-M1 baseline.
4. `glob **/SKILL.md` → returns exactly `meta` + `example-skill`.
5. Manual CLI smoke (deferred to user acceptance — out of plan-mode scope): open command palette, verify `/plan` / `/review` descriptions render correctly.

## Checkpoint / update rules

- After M1 lands: `update_plan_status` to set the M1 task `done`, set `currentTask` to empty, record the deletion + description-change lesson in LESSONS.md via `update_plan_status` (append), and mark `sessionStatus: completed` once validation is green.
- If a snapshot test in the CLI suite regresses on the `formatAvailableSkillsXml` output (two fewer `<skill>` entries): re-record the snapshot via `bun --cwd cli run test -u` (or the project's equivalent); record the snapshot-update gotcha in LESSONS.md.
- If `bun --cwd cli run typecheck` fails — re-read `cli/src/data/slash-commands.ts` to confirm the two-line edit, fix forward, re-run.
- SPEC.md / PLAN.md changes go through `create_plan` (substantial rewrites only — not expected for this small session).
- STATUS.md / LESSONS.md incremental updates go through `update_plan_status`.
- If the user answers Q1/Q2 with custom copy, update PLAN.md task 1/2 wording via `create_plan` rewrite, then execute.

## Resume instructions

- Artifacts under `.agents/sessions/legacy-skill-prune/`: `SPEC.md` (this scope), `PLAN.md` (this file), `STATUS.md` (lifecycle), `LESSONS.md` (gotchas).
- To execute M1: switch out of plan mode. Read `cli/src/data/slash-commands.ts` lines 90-130 to confirm the two strings haven't drifted. Apply the two `str_replace` replacements atomically. Then `git rm` the two vestigial SKILL.md files. Then run the validation gates in order. On green, `update_plan_status` to `sessionStatus: completed`.

## Open questions (need user decision before execution)

- ❓ **Q1:** `/plan` replacement description. Default: `Create a durable plan with the configured planner`. Alt: `Create a durable plan`.
- ❓ **Q2:** `/review` replacement description. Default: `Review code changes with the configured reviewer`. Alt: `Review uncommitted code changes`.

## Status

- M1 — Slash-command description refresh + vestigial-skill deletion: **done** (Q1/Q2 defaults applied; T1-T4 executed; validation green; session completed).