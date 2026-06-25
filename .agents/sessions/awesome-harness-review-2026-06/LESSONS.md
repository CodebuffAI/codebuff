# Awesome Harness Engineering Review — LESSONS

## Insights from the review
- Our harness already implements a substantial portion of the foundations in the awesome list. Durable plan artifacts, structured reviewer gate, read-before-edit, and context-pruner are mature primitives that don't need replacement — they need *documentation* (HarnessCard) and *extension* (capability scan, OTel).
- The biggest gaps are *observability* (no OTel / AgentOps), *standardized reporting* (no HarnessCard), and *external benchmark coverage* (we don't run SWE-bench, τ-Bench, or Terminal-Bench).
- The next-most-impactful improvements are safety-oriented: Lurkr-style shadow-capability scan, prompt-injection analyzer, and sandbox policy. These map directly to concrete awesome-list items.
- Several awesome-list items are misaligns (skills.sh, Uni-CLI, Ralph Wiggum) — not every "awesome" item is a fit for our local-first / multi-agent / BYOK model. Document non-adoption rather than silently skipping.
- The `scripts/byok-wording-guard.ts` static-guard pattern is the right shape for P0.2 (capability scan). We can mirror it without inventing a new architecture.

## Decisions made
- Do NOT recommend a global rewrite. P0 items are additive, not refactors.
- Do NOT integrate all benchmarks. Pick 1–2 close to our task surface.
- DO produce a HarnessCard so the team and external readers can understand our harness in one page.
- DO extend the static-guardrail pattern from `scripts/byok-wording-guard.ts` to a capability guard.
- DO recommend Terminal-Bench + τ-Bench as the first two benchmarks; SWE-bench Verified is a longer-term candidate.

## Non-adoptions (with rationale)
- **Ralph Wiggum pattern** — single-task `while :; do cat PROMPT.md | claude-code; done` is incompatible with our multi-agent harness and explicit gate state.
- **skills.sh marketplace** — community marketplace for skills; we are local-first / BYOK-only and ship our own curated skills.
- **Uni-CLI** — declarative YAML pipeline adapters; misaligns with our typed native tool schema.
- **GitHub Spec Kit** — spec-driven scaffolding tool; we have a richer internal equivalent via `create_plan` + `update_plan_status`.

## Risks to remember
- Bandwidth: P0 items should ship in ≤1 week combined. P1/P2 require explicit commitment.
- Benchmark integration is recurring maintenance cost; pick tasks close to our work surface.
- OTel/AgentOps adoption changes the privacy story (where traces go); default-on vs. feature-flag is a real product decision, not just an engineering one.
- Lurkr-style scans can have false positives on legitimate `@tool` decorators that take `eval` parameters. Need a denylist + review.

## Follow-up notes
- A quarterly re-scan of the awesome list could be valuable as the harness ecosystem matures.
- P2 items (trace grading, trajectory critic, harness evolver) are aspirational and should not block the team.
- The HarnessCard, when shipped, should explicitly list non-adoptions with rationale.
- The 12-Factor AgentOps audit doc (P1.8) should be reviewed at next planning cycle.

<!-- update_plan_status:appended -->
## Mex + plan management follow-up — 2026-06-23T04:54:20.210Z

## Mex borrowings — 2026-06-23

- mex-agent solves a real problem (one-shot `CLAUDE.md` flood → task-routed context). Reports ~60% token savings in real benchmarks.
- We do not want to depend on `mex-agent` itself — `.mex/` conflicts with our `.agents/sessions/<slug>/` layout, and Bun integration is real cost.
- The 11 zero-token drift checkers are a strong pattern; we currently have 1 (`byok-wording-guard.ts`). Adding the rest is the highest-leverage mex borrowing.
- ROUTER.md + JSONL event log + tool-config-sync are the three patterns that map most cleanly onto our existing system.
- mex's `--mode agent-memory` (HEARTBEAT.md) is a real gap for OpenClaw-style homelab agents. P1.16 addresses it.

## Plan management lessons — 2026-06-23

- We have rich plan *creation* and *update* primitives but no concept of which plan is currently active. This is the gap that makes the plan executor feel ad-hoc.
- Tri-state task status (`[~]` in_progress) is more useful than binary `[ ]`/`[x]` for the executor's mental model.
- An active-session pointer (file or CLI flag) is the cheapest "session registry" we can ship.
- Auto-archive is dangerous without an explicit user prompt; keep archive user-driven.
- Cross-session task graphs (P2.25) are powerful but high complexity; defer to a follow-up.
- Session templates (P2.26) would help standardize plan creation across the team; defer until we have more organic template demand.
- The plan management set (P0.17–21) should ship as one cohesive change — they depend on each other.


<!-- update_plan_status:appended -->
## Plan management lessons (P0.17–P0.21) — 2026-06-23T05:30:00.000Z — 2026-06-23T05:12:56.497Z

## Plan management lessons (P0.17–P0.21) — 2026-06-23T05:30:00.000Z

### Decisions made

- **Single-line `<!-- current-task: ... -->` annotation** instead of a structured JSON block in PLAN.md. Reasons: (1) PLAN.md is meant to be human-edited; a JSON block would conflict with task descriptions. (2) Markdown comments are already invisible in rendered output but trivially parseable. (3) The annotation lives directly under the H1, so an agent resuming the plan sees both the title and the current task in one screen.

- **Tri-state grammar in the checkbox** (P0.18) rather than a separate `tasks.json`. Reasons: (1) GFM task lists are already the canonical checklist surface; introducing a parallel JSON would create two sources of truth that drift. (2) `[~]`/`[/]`/`[!]` chars are easy to type and survive copy-paste. (3) `TASK_MARK_STATUS` makes the inverse map fully recoverable from the markdown.

- **`.agents/ACTIVE_SESSION` as a plain slug file** (P0.17) instead of a JSON blob or env var. Reasons: (1) It needs to be editable from the CLI without touching JSON. (2) A single slug is all the runtime needs to find the active session. (3) Multi-line content is rejected, so we don't have to worry about CR/LF smuggling.

- **STATE.json as a sibling artifact** (P0.20) — *not* the source of truth for plan content, only for lifecycle metadata. PLAN.md/STATUS.md/LESSONS.md remain the content artifacts. STATE.json's `schemaVersion: 1` lets us migrate later without breaking older readers.

- **Wrote entire P0.17–P0.21 as one cohesive batch** rather than sequential merges. The five items share data types, validation rules, and CLI wiring — splitting them would have produced five partial PRs that don't work standalone. One batch means one validation pass and one reviewer gate.

### Gotchas / surprises

- The existing test `validatePlanStatusPath > rejects SPEC.md/PLAN.md and other names` was stale after P0.18: `update_plan_status` now intentionally permits `PLAN.md` (so it can toggle tri-state checkboxes). Updated the test to use `SPEC.md` (still create-only) and `NOTES.md` (never allowed). Lesson: when extending an allowlist, audit *all* test cases that asserted the old allowlist boundary — not just the new ones.

- `resolveSessionDir` in `plan-artifacts.ts` calls `projectRootResolver()` which throws by default. `safeProjectRoot()` catches the throw and returns null, which means every read/write helper has a no-project-root fallback. The CLI bootstrap calls `setProjectRootResolver()` to wire the real root; tests use a per-test resolver. This pattern keeps the library free of `process.cwd()` assumptions.

- `applyTaskUpdate` had to do a tail-only note de-dup check before appending `(...)`. The naive "does the substring appear anywhere in the line?" test matches too often (it would treat a note in existing prose as a duplicate). The fix: split off the trailing `(<note>)` group before comparing. Same lesson as the prior session.

- `validatePlanStatusPath` uses an `allowlist regex` (matching the full path shape) rather than a denylist regex (matching forbidden patterns). The allowlist is safer because new escape patterns don't get retroactively allowed.

- `<!-- current-task: ... -->` was implemented as a regex anchor, not a structured block, so the existing `<!-- update_plan_status:appended -->` comment marker and the new `<!-- current-task: ... -->` annotation can both live in PLAN.md without colliding. The regexes are anchored to `^` and `$` and the comment body is bounded, so neither matches the other.

### Process lessons

- Validation hooks (the `run_file_change_hooks` step) returned `no_hooks_configured` for this change. We still ran typecheck and tests manually, but the harness didn't auto-validate. Follow-up: add a real hook so the next code-only batch gets a real gate.

- The reviewer gate is a sibling of validation, not a replacement. Even when validation passes, the harness should still re-invoke `code-reviewer` for changed files. Today's gate ran the reviewer on the awesome-review artifacts but not on the new code. Fix: scope the gate to `pendingFiles` (already supported) and re-invoke it after every `edit_transaction`/str_replace batch.

- The pinned active-work state (`.omx/state/todos-session.json` + the harness-provided `pinned_active_work_state` block) survived context compaction, so resuming the validation phase after a series of edits required no re-discovery. The only drift was the stale test name; everything else stayed in lockstep.

### Risks to monitor

- The active session pointer (`.agents/ACTIVE_SESSION`) lives at the project root. If the CLI is launched from a subdirectory of the project, the resolver must be wired before the first read. Currently the CLI sets the resolver at startup; if a future spawn-agents path writes to STATE.json without setting the resolver first, it will silently no-op. Add a startup-time check that warns if `readActiveSessionPointer()` returns null after the resolver is set.

- `getSessionDirForArtifact` and `getSessionSlugForArtifact` are used in many call sites. If we add a new artifact name (e.g., `PROGRESS.md`), every regex in this file will need to be updated. Follow-up: replace the regexes with a single `PLAN_ARTIFACT_NAMES.includes(basename)` check.

- The CLI `formatPlanListReport` enumerates sessions from disk each time `/plans` is invoked. For very large `.agents/sessions/` trees (100+ sessions), this becomes O(n) on every command. Cache later if needed; not a problem at current scale.

### Follow-up notes

- The next batch (P0.11–P0.13 mex borrowing, or v1 P0.1 HarnessCard) should land in a fresh implementation session under `.agents/sessions/<new-slug>/` rather than this one, so the awesome-review packet stays a review artifact.

- Open questions Q1 (routing table location) and Q3 (archive policy) still need user decisions before P0.11 and P0.17-archive respectively can be implemented.

- Add a small Bun test under `cli/src/commands/__tests__/` for `formatPlanListReport` rendering edge cases (no sessions, only archived sessions, mixed statuses).


<!-- update_plan_status:appended -->
## Reviewer fixes and final validation — 2026-06-23T05:18:18.854Z

## Plan management P0.17–P0.21 — 2026-06-23 (after reviewer fixes)

Shipped the durable plan-management set as one cohesive change across 7 files plus a follow-up fix to add a missing `existsSync` import in `cli/src/commands/command-registry.ts`. Final validation: common typecheck + 32 plan-artifacts tests + agent-runtime typecheck + 26 update-plan-status handler tests + cli typecheck + 147 CLI command tests, all exit 0.

### Files changed
- `common/src/util/plan-artifacts.ts` — tri-state task vocabulary (`[ ]`/`[~]`/`[x]`/`[/]`/`[!]`), `PlanSessionState` + `STATE.json` I/O, active session pointer, current-task annotation helpers, strict path validation (PLAN.md now allowed by `update_plan_status`).
- `common/src/tools/params/tool/update-plan-status.ts` + `packages/agent-runtime/src/tools/handlers/tool/update-plan-status.ts` — handler reads `status` (tri-state), `currentTask`, and `sessionStatus`; tri-state `in_progress` auto-promotes the current-task pointer.
- `cli/src/commands/plan-artifacts.ts` — `/plans` command, helpers (`readStateForSession`, `countProgress`, `readCurrentTaskForSession`), strict slug validation via `isValidPlanSlug`.
- `cli/src/commands/command-registry.ts` — wires `/plans` and `/plan-use <slug>` commands; `/plan-use` rejects unknown slugs whose session directory does not exist.
- Tests: 32 new in `common/src/util/__tests__/plan-artifacts.test.ts`; 8 new in `packages/agent-runtime/.../update-plan-status.test.ts` (one stale test updated to reflect the new PLAN.md allowance).

### Gotchas
1. **`cli/src/commands/command-registry.ts` did not import `fs`.** When adding an existence check for `/plan-use`, the obvious `fs.existsSync(...)` reference produced a CLI typecheck error (`TS2304: Cannot find name 'fs'`). Fix: import `existsSync` from `node:fs` and use the named binding. Going forward, prefer importing the named functions from `node:fs` rather than a default `fs` import — keeps the surface explicit and matches Node's documented API.
2. **`readStateForSession` must return a synthesized default when STATE.json is missing or unparseable.** The runtime handler now normalizes invalid `status` to `'active'`, but the CLI list view (`listPlanSessions`) needs the same default so freshly-created sessions that haven't yet been touched still appear in `/plans`.
3. **`currentTask` precedence.** STATE.json is canonical, but `<!-- current-task: ... -->` in PLAN.md takes precedence because `update_plan_status` writes the annotation atomically with task transitions. This avoids stale-state races between STATUS.json writes and PLAN.md edits.
4. **`active` marker uses a single-character column** so the badge column lines up across `active / paused / completed / archived`. Don't pad with extra spaces or the active marker drifts.
5. **Stale tests need explicit updates.** The existing `validatePlanStatusPath > rejects SPEC.md and other names` test was invalidated by P0.18 (PLAN.md is now allowed). Keep test cases in lockstep with the policy — when tightening or loosening validation, sweep the test file in the same commit.

### Reusable patterns
- **Single helper for the canonical state shape.** `readStateForSession` lives in `cli/src/commands/plan-artifacts.ts` and delegates parsing/validation to `common/src/util/plan-artifacts.ts`. Adding `/plan-archive` later should use the same helper instead of re-parsing STATE.json.
- **Existence check before pointer write.** `/plan-use` validates that the resolved directory exists before calling `writeActiveSessionPointer` so the pointer never points to a non-existent session. Apply this pattern to any future commands that mutate `.agents/ACTIVE_SESSION`.
- **Tri-state auto-promotion.** Setting a task to `in_progress` (`[~]`) automatically writes the `<!-- current-task: ... -->` annotation. This makes `/plans` `current: "..."` reflect what the executor is actively working on without a separate `update_plan_status` call.

### Follow-ups
- `/plan-archive <slug>` to write `sessionStatus: archived` via `update_plan_status` (no new tool needed; this is just a UX wrapper).
- Auto-promote `currentTask` from the file path most recently edited by the executor (P1).
- `openbuff plans` / `openbuff plan use` long-form aliases (the short `/plans` and `/plan-use` forms are already wired).
- Resolve Q1 (routing table location: `AGENTS.md` vs. `common/knowledge.md`) and Q3 (archive: user-driven vs. 30-day auto) when starting the mex-borrowing P0.11–13 set.


<!-- update_plan_status:appended -->
## Reviewer nit cleanup — 2026-06-23 — 2026-06-23T05:29:25.605Z

## Reviewer nit cleanup patterns (P0.17–P0.21 follow-up)

Six non-blocking nits were queued by the reviewer (NON_BLOCKING verdict on the plan-management set). All six addressed in one cohesive pass; patterns reusable for future cleanups:

### Patterns
- **Line-based helper alongside string helper**: When a public API takes a string body (e.g. `setCurrentTaskAnnotation(content, pointer)`) but the only callers operate on a line array, expose a `Lines`-suffixed variant that mutates `string[]` in place. The string API then `join`s/`split`s on top of the line variant. This avoids the round-trip cost and the "did the body get re-joined weirdly?" debug trap.
- **Canonical regex re-export**: When a regex describes a *vocabulary contract* (e.g. "what is a checklist line?"), define it once in the lowest layer (`common`) and re-export it. Higher layers (`agent-runtime`, `cli`) import the canonical name. Document the re-export as the source of truth so grepping for the regex literal doesn't find drift candidates.
- **`?? synthesizedFallback(x)` over `if (a) ... else if (b) ... else constructDefault()`**: When two branches both need the same synthesized fallback, collapse into `state ?? synthesizedFallback(slug)`. Avoids duplicate object construction.
- **Resolver wiring at the construction site**: Module-level resolvers (e.g. `projectRootResolver`) are easier to reason about when wired *once* at the place that owns the dependency (`setProjectRoot` in `project-files.ts`), instead of scattered across N call sites. Tests still pass `setProjectRootResolver(...)` in `beforeEach`; production code never calls it.
- **Drop dead try/catch eagerly**: If a called function is pure (e.g. `readCurrentTaskAnnotation` is just `content.match(...)`), a try/catch wrapping it can only ever mask bugs. Drop it during cleanup passes. The guideline "prefer to remove unnecessary try/catch blocks" applies even when removing the catch is technically a no-op for behavior.

### Gotchas
- **Returning original `lines` on miss**: When a line-mutating helper returns a `{ lines, matched }` pair, return `lines` (the original reference) on `matched: false`. Returning `lines.slice()` pretends a write happened and forces the caller to re-check; also pays an unnecessary copy. The handler's `applyTaskUpdate` follows this convention now.
- **`process.chdir(tempDir)` in handler tests**: The runtime handler's `getProjectRoot()` uses `process.cwd()` under the hood (via `setProjectRootResolver`); tests must `process.chdir(tempDir)` before exercising file I/O or the resolver points outside the temp dir. The existing test suite already does this; keep the pattern when adding new handler tests.
- **Module-level mutable singletons in `common`**: `projectRootResolver` is a global mutable singleton overwritten by `setProjectRootResolver(...)`. Works fine in single-process Bun tests because `beforeEach` can reset it, but is fragile under parallel test workers. The Nit 3 fix wires it once in `setProjectRoot` so production code never mutates the singleton — tests still reset via `setProjectRootResolver`, which is the documented test seam. A future cleanup could parameterize the resolver per-call, but it's not blocking today.

### Follow-up notes
- The two cross-layer regexes that previously duplicated `TRI_STATE_CHECKBOX_LINE_RE` are now collapsed; audit any other vocab-regex duplications in `agent-runtime` and `cli` that mirror a `common` regex (search for literal patterns imported across package boundaries).
- `setCurrentTaskAnnotationLines` is now the preferred API for callers operating on a line array; `setCurrentTaskAnnotation` is kept as a thin wrapper for string-body callers. When adding new PLAN.md mutators, prefer the line-array form unless the caller already has a single string.
- The runtime handler still calls `setProjectRootResolver(...)` once internally (entrypoint seam). That call is fine and is *not* the "scattered ad-hoc" pattern the reviewer called out — the call-out targeted the three CLI sites which are now collapsed into `setProjectRoot` in `cli/src/project-files.ts`.
- Future nit-cleanup passes: pre-scan with `code_searcher` for `try {` blocks around well-known pure functions to find dead catches cheaply.


<!-- update_plan_status:appended -->
## Unused-import follow-up patterns — 2026-06-23T05:32:47.412Z

## Unused-import follow-up patterns

After the nit-cleanup refactor (rewiring `setProjectRootResolver` to a single init-time site, collapsing duplicate fallbacks, and switching to canonical re-exports), two imports in `cli/src/commands/plan-artifacts.ts` — `PLAN_SESSION_STATUSES` and `STATE_FILENAME` — were no longer referenced. Reviewer caught both in a NON_BLOCKING pass.

**Lesson:** Refactor passes that move behavior between modules almost always leave behind dead imports on the *source* side, even when tests stay green (TypeScript only flags them under `noUnusedLocals`/`noUnusedParameters` strictness, and runtime imports are tree-shaken away by Bun's bundler anyway). Add a quick `code_searcher` sweep for the symbols you *removed usage of* after any cross-module refactor, and prune the imports in the same commit. Cheap, keeps the import surface honest, and makes the next reviewer's job easier.

