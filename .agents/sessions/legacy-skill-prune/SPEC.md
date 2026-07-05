# SPEC: Legacy skill & slash-command prune for the BYOK fork

## Overview

The fork (`origin` = AnzoBenjamin/openbuff) is a local-first, BYOK-only fork of Codebuff. This session prunes legacy skill / slash-command surface that is **obsolete under BYOK + the fork's stronger planning layer**, and folds any still-valuable procedural content into the agent template that already carries the surrounding prose.

This session is **logically independent** of `.agents/sessions/upstream-byok-beneficial-changes/` (M1-M6, upstream feature-parity ports). The two sessions must not depend on each other; either can be executed first.

## Scope (verified by in-depth audit, 2026-07-05)

The audit verified the actual on-disk skill surface of the fork:

- `glob **/SKILL.md` returns **4** paths:
  - `.agents/skills/meta/SKILL.md` — 5 bullets (validation heuristics, scoped diff, `bun run --cwd`, SDK-eval persistence, structured-log debugging)
  - `.agents/skills/cleanup/SKILL.md` — 1 paragraph ("simplify, reuse, lower complexity")
  - `.agents/skills/review/SKILL.md` — 1 paragraph ("review uncommitted changes")
  - `common/src/templates/initial-agents-dir/skills/example-skill/SKILL.md` — scaffold, shipped for users; **not** a cleanable skill.
- `grep -r 'source-command|flow-nexus|sc-git|sc-workflow|sc-task|sc-implement|sc-test|sc-analyze'` across `*.ts/*.tsx/*.md/*.json` → **0 hits**. The 30-odd `sc-*` + `flow-nexus-*` skill ids visible in *this conversation's* pre-loaded skill catalog are **runtime-injected by the harness driving this conversation**, not files on disk in the fork. They are NOT a fork-cleanable surface.
- `grep 'skill' cli/src/agents/bundled-agents.generated.ts` → all 15 hits are the `"skill"` *tool name* listed in agent `toolNames` arrays. **No `sc-*` / `flow-nexus-*` skill ids are baked into the CLI's bundled-agents artifact.** Confirms the harness-injection conclusion above.
- Stale slash-command descriptions: `cli/src/data/slash-commands.ts` line 96 (`/plan`: `Create a plan with GPT 5.4`) and line 125 (`/review`: `Review code changes with GPT 5.4`). `gpt-5.4` appears elsewhere in the repo (README, `provider-config.ts`, `chatgpt-oauth.ts`) only as a **legitimate BYOK model id** — not a legacy-skill marker, not in scope.

## Goals

1. Remove the two stale "GPT 5.4" claims from `/plan` and `/review` descriptions (`cli/src/data/slash-commands.ts:96,125`). Pure text edit; planner is model-agnostic under BYOK.
2. Delete the two vestigial on-disk skills whose content is fully duplicated by the fork's root prompts / agent registry / slash-command handlers:
   - `.agents/skills/cleanup/SKILL.md` — duplicated by root "Code Craftsmanship / Simplicity & Minimalism / Code Reuse" section inherited by every spawned agent.
   - `.agents/skills/review/SKILL.md` — duplicated by the `/review` slash command (`cli/src/commands/command-registry.ts:940` `review` handler → `buildReviewPromptFromArgs`) AND by the auto-spawned `code-reviewer` reviewer-gate that runs after every edit.
3. Keep `.agents/skills/meta/SKILL.md` — its content (SDK-eval persistence, `bun --cwd`, structured-log debugging) is **not** duplicated by any agent template and remains genuinely valuable.
4. *No fold required* for this session: the surviving `meta` skill content is already appropriately scoped as a skill (project-level heuristics), not agent-prompt-prose.

## Non-goals

- Touching the harness-injected `sc-*` / `flow-nexus-*` skill catalog. They are not on disk in this fork; cleaning them is a harness-side change, out of scope.
- Touching the upstream-byok-beneficial-changes session (M1-M6). Independent.
- Removing `gpt-5.4` as a *model id* anywhere — it's a legitimate BYOK model name in `provider-config.ts`, README, `chatgpt-oauth.ts`. Out of scope and correct as-is.
- Touching the durable-plan quartet (`/plan`, `/resume-plan`, `/update-plan`, `/plan-status`, `/lessons`, `/interview`). They are user-facing verbs and remain.
- Folding procedural content into `agents/base2/base2.ts` or `agents/base2/base-deep.ts` system prompts — *not needed* in this session, because `meta` is the only surviving skill and its content is correctly scoped as a skill. (Identified fold target reserved as a contingency if `meta` is later judged redundant; not exercised now.)
- Refactoring the skill loader, skill registry, slash-command runtime, or command-palette UI. Out of scope — only the 2 description strings + 2 file deletions.
- Editing `common/src/templates/initial-agents-dir/skills/example-skill/SKILL.md` — that's the user-facing scaffold, intentionally shipped.

## Requirements

- After the prune, every surviving on-disk skill is either:
  (a) a user-invokable verb surfaced via `skill:<name>` slash command, OR
  (b) carries procedural content no agent template already covers.
- The `/plan` and `/review` slash commands continue to behave identically; only their palette descriptions change.
- No new `gpt-5.4` model-id removal — only the two description strings.
- No test regressions: `cli` test suite (`cli/src/commands/__tests__/command-args.test.ts`, `cli/src/commands/__tests__/command-suggestions.test.ts`, etc.) must still pass. The `command-args.test.ts` test references `/plan`, `/resume-plan`, `/update-plan`, `/lessons`, `/plan-status` — these are unchanged in behavior, only the description string in the registry.
- `grep -iE 'freebuff|IS_FREEBUFF' cli agents common packages` after every edit → zero new hits (inherited from the upstream-byok session's gate; trivially satisfied since this session doesn't touch freebuff-coupled code).

## Acceptance criteria

- [ ] `cli/src/data/slash-commands.ts` line 96 description no longer contains "GPT 5.4" — replaced with model-agnostic copy (suggested: `Create a durable plan with the configured planner`).
- [ ] `cli/src/data/slash-commands.ts` line 125 description no longer contains "GPT 5.4" — replaced with model-agnostic copy (suggested: `Review code changes with the configured reviewer`).
- [ ] `.agents/skills/cleanup/SKILL.md` deleted from disk.
- [ ] `.agents/skills/review/SKILL.md` deleted from disk.
- [ ] `.agents/skills/meta/SKILL.md` unchanged and still discoverable via `skill:meta`.
- [ ] `bun --cwd cli run test` passes (specifically `command-args.test.ts` and `command-suggestions.test.ts` validate the registry).
- [ ] `bun --cwd cli run typecheck` passes.
- [ ] `grep -iE 'freebuff|IS_FREEBUFF' cli agents common packages` → 0 new hits.
- [ ] `glob **/SKILL.md` returns 2 paths: `meta` + `example-skill`.
- [ ] `cli/src/commands/command-registry.ts:940` `review` handler and `cli/src/commands/prompt-builders.ts buildReviewPromptFromArgs` continue to work end-to-end.

## Relevant files / systems (verified)

- `cli/src/data/slash-commands.ts` — static slash-command definitions; lines 96 + 125 are the only "GPT 5.4" strings to fix. `getSlashCommandsWithSkills()` at line 221 appends `skill:<name>` entries dynamically — unchanged by this prune.
- `cli/src/commands/command-registry.ts` — `findCommand()` falls back to `skill:`-prefixed lookups via `getSkillByName()`; `createSkillCommand()` wraps a skill as a command. Unchanged by this prune.
- `cli/src/utils/skill-registry.ts` — calls `sdkLoadSkills()` at startup; caching layer. Unchanged.
- `sdk/src/skills/load-skills.ts` — `getDefaultSkillsDirs()` scans `~/.agents/skills`, `~/.agents/skills`, `{cwd}/.claude/skills`, `{cwd}/.agents/skills`; `discoverSkillsFromDirectory()` parses frontmatter. Unchanged. Will simply no longer find `cleanup` / `review` after the files are gone.
- `common/src/util/skills.ts formatAvailableSkillsXml()` — serializes the loaded `SkillsMap` into `<available_skills>` XML injected into the `skill` tool description. After deletion, the XML list will cleanly drop the two entries; no code change required.
- `.agents/skills/{meta,cleanup,review}/SKILL.md` — the on-disk skill content. `cleanup` and `review` are deleted; `meta` is kept.
- `cli/src/commands/__tests__/command-args.test.ts` — references `/plan`, `/resume-plan`, `/update-plan`, `/lessons`, `/plan-status` argument parsing; behavior unchanged.
- `cli/src/commands/__tests__/command-suggestions.test.ts` — fuzzy-match against command names + aliases; the two description edits don't change command names or aliases.
- `cli/src/utils/__tests__/message-block-helpers.test.ts` — references `/resume-plan`, `/update-plan`, `/plan-status`, `/lessons` resume/update/status/lessons commands; unchanged.

## Risks / open questions

- ❓ **Q1:** Suggested replacement copy for `/plan` description — `Create a durable plan with the configured planner` vs. simply `Create a durable plan`? (Defaults to the former for parity with `/resume-plan`'s "durable plan session" wording; user can override.)
- ❓ **Q2:** Suggested replacement copy for `/review` description — `Review code changes with the configured reviewer` vs. `Review uncommitted code changes`? (Defaults to the former.)
- ⚠️ **Risk:** any user who has manually extended `.agents/skills/cleanup/SKILL.md` or `.agents/skills/review/SKILL.md` with custom content will lose their edits on `git pull` / rebase. Mitigation: announce the deletion in the commit message and in the LESSONS.md for this session; users who want custom cleanup/review procedural content should put it in a differently-named skill (e.g. `.agents/skills/my-cleanup/SKILL.md`).
- ⚠️ **Risk:** the `formatAvailableSkillsXml` output change is cosmetic (two fewer `<skill>` entries), but if any test snapshots assert the exact XML, it'll fail. Mitigation: M1's validation step runs the full CLI test suite and will surface any snapshot regression; fix-forward if it appears.

## Out-of-scope dependencies (shared with other sessions)

- The freebuff-grep gate is inherited from the `upstream-byok-beneficial-changes` session's hard constraint. This session trivially satisfies it (no freebuff-coupled code is touched).
- No SDK / agent-runtime / common-package changes are required for this prune — only `cli/` + on-disk skill files.