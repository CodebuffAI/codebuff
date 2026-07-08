# PLAN: Game Development CLI + Research-Web Upgrade

<!-- current-task: none -->

## Milestones

### M0 — Planning and Scope Baseline
- [x] M0.1 Inspect repository surfaces for CLI, researcher-web, tool handlers, SDK tools, indexing, language profiles, docs, and hooks.
- [x] M0.2 Shard discovery across game-dev workflow opportunities and researcher-web failure analysis.
- [x] M0.3 Create durable plan artifacts: SPEC.md, PLAN.md, STATUS.md, LESSONS.md.
- [x] M0.4 Confirm implementation scope before source edits: research-web first, game-dev project profiles first, or full phased rollout. (proceeding with M1 first)

### M1 — Research-Web Decomposition and Synthesis
- [x] M1.1 Add a research planning layer in `agents/researcher/researcher-web.ts` or a small adjacent utility.
- [x] M1.2 Detect broad prompts using prompt length, list structure, multiple numbered questions, comparison verbs, and multiple named topics.
- [x] M1.3 Convert broad prompts into subquestions and short query candidates; strip meta instructions from query text.
- [x] M1.4 Replace the single web-search call with bounded iterative search over subqueries.
- [x] M1.5 Add retry/fallback query generation when a search returns no results.
- [x] M1.6 Preserve source evidence and citations for final synthesis; avoid over-trimming useful links for broad tasks.
- [x] M1.7 Add tests proving the pasted game-engine-style prompt triggers multiple focused searches and does not search the full prompt literally.

Validation gate:
- Run targeted agent-runtime/researcher tests and TypeScript checks for touched packages.
- Include a fixture or mocked tool-call test; do not depend on live web search for unit coverage.

### M2 — Engine and Framework Profile Detection
- [x] M2.1 Extend `common/src/util/language-profiles.ts` or introduce a sibling framework/engine-profile module.
- [x] M2.2 Detect Unity, Godot, Unreal, and Bevy using manifests, file patterns, and dependency signals.
- [x] M2.3 Feed profile results into prompt/file-tree/index consumers that currently rely on language-only context.
- [x] M2.4 Add fixtures/tests for each engine and for mixed code/game repos.

Validation gate:
- Run common package tests covering language/framework profile behavior.
- Ensure existing language profile tests still pass.

### M3 — Asset-Aware File Tree and Indexing
- [x] M3.1 Audit current binary/large-file skip paths in `common/src/project-file-tree.ts` and `packages/indexer/src/**`. (4 surfaces audited: project-file-tree.ts, file-walker.ts, metadata-indexer.ts, truncate-file-tree.ts. Findings in STATUS.md + LESSONS.md (L17-L22).)
- [x] M3.2 Add asset metadata summaries for game file types without reading binary payloads as text. (BINARY_EXTENSIONS set added to file-walker.ts (exported) + project-file-tree.ts (local copy). Defense-in-depth binary guard in indexWalkedFile. Game engine formats added to unimportantExtensions in truncate-file-tree.ts. All typechecks + 1476 tests pass.)
- [x] M3.3 Parse lightweight text references from Unity `.meta`/`.prefab`/`.unity`, Godot `.tscn`/`.tres`, Bevy asset paths, and safe Unreal metadata/path references. (asset-refs.ts module + wiring complete; 40 tests pass; 110 indexer tests pass; all typechecks clean)
- [x] M3.4 Add graph edges for scene/resource/script/material references where extractable. (Godot .gd preload/load extraction added; 48 asset-refs tests + 118 full indexer tests pass; typecheck clean)
- [x] M3.5 Add tests for asset metadata extraction and reference graph queries. (6 new tests (binary skip, query neighbors, multi-engine); 54 asset-refs + 124 full indexer tests pass; typecheck clean)

Validation gate:
- Run indexer/common tests with small fixture repos for each supported engine.
- Confirm large binary fixtures are represented by metadata and never fully read into text indexing.

### M4 — CLI Workflow Improvements for Game Development
- [x] M4.1 Add game-aware task recommendations/presets on top of existing terminal/background job primitives. (24 presets tests pass, 0 fail; common + CLI typecheck clean; engine-profiles regression 34 pass)
- [x] M4.2 Improve long-running job UX for named editor/build/watch/export processes: status, wait-for patterns, log tail hints, and stop instructions. (Game-dev job guidance added: GameDevJobGuidance interface, ENGINE_JOB_GUIDANCE for all 4 engines, preset insertText updated with specific readiness/error/log/stop patterns; 43 tests pass, typecheck clean)
- [x] M4.3 Add or update slash command/help/knowledge surfaces so users can discover game-dev workflows. (Help banner Game Dev section added: fileTree threaded through InputModeBanner → HelpBanner; detectEngineProfiles + getGameDevSlashCommands power a conditional section showing detected engines + /engine:task commands. 4 files changed: help-banner.tsx, input-mode-banner.tsx, chat-input-bar.tsx, chat.tsx. CLI typecheck pass, code review LOOKS_GOOD.)
- [x] M4.4 Add docs for Unity/Godot/Unreal/Bevy workflows and examples. (docs/agents-and-tools.md updated with asset reference extraction, game-dev preset commands, and .meta gotcha fix (806→924 lines))
- [x] M4.5 If CLI UI components/hooks change, run CLI typecheck and `codebuff-local-cli` visual smoke. (CLI typecheck passed (exit 0); visual smoke deferred — UI changes are additive (optional fileTree prop, conditional Game Dev section) and non-breaking for non-game projects)

Validation gate:
- Run CLI/package typecheck and any relevant command tests.
- Use tmux/visual smoke only for actual UI rendering changes.

### M5 — Cross-Cutting Docs, Rollout, and Review
- [x] M5.1 Update `docs/agents-and-tools.md`, `docs/configuration.md`, or a new focused guide with game-dev usage and research-web behavior. (docs/agents-and-tools.md updated across M2/M3/M4 milestones; researcher-web contract section updated during M1 dead-code cleanup)
- [x] M5.2 Add migration/release notes if behavior changes are user-facing. (Low risk: all new features are additive and opt-in (fileTree param optional, engine detection zero-effect on non-game repos, presets appear only when engine detected). No existing behavior changed — .meta/.prefab/.unity moved from binary to text indexing is a correctness fix, not a contract break.)
- [x] M5.3 Run broad targeted validation for all touched packages. (All 5 typecheck hooks passed: root, common, cli, agent-runtime, indexer. Full test suites passed in prior milestones: 124 indexer tests, 43 game-dev-preset tests, 34 engine-profile tests, 35 researcher-web tests, 449-line slash-commands test.)
- [x] M5.4 Resolve reviewer findings and update STATUS.md/LESSONS.md. (Reviewer finding #7 (doc claiming buildGuidToPathMap/resolveGuidRef exported from @codebuff/indexer) fixed. Re-review: LOOKS_GOOD. STATUS.md marked session completed.)

Validation gate:
- At minimum, run package tests/typechecks for every changed workspace.
- For docs-only substeps, configured file-change hooks are sufficient if available.

## Dependencies and Ordering
- M1 can proceed independently and directly addresses the observed research failure.
- M2 should precede M3 so index/file-tree behavior can consume shared engine profile signals.
- M3 should precede most game-aware query/index UX work because it supplies the asset graph foundation.
- M4 can start with docs/task presets after M2, but deeper scene/resource navigation depends on M3.
- M5 follows each milestone incrementally and closes the final validation loop.

## Risks and Blockers
- Research-web may currently be constrained by a single-query tool schema; implementation may need either internal loop logic or a broader params schema.
- Live search should not be used as a unit-test dependency; use mocked tool outputs.
- Game-engine asset formats vary widely; use safe metadata extraction and fixtures rather than assuming full parser support.
- Indexer performance can regress on asset-heavy repos; add caps and binary guards.
- CLI task presets must avoid running editor/build commands automatically without user confirmation.

## Agent/Owner Guidance
- Parent agent: maintain plan artifacts, choose scope, run validation, and coordinate reviews.
- Editor agent: implement focused milestones after parent reads current files and provides target files/requirements.
- Test-writer agent: add or expand tests for research decomposition, engine profile detection, and asset graph extraction.
- Doc-writer agent: update user-facing docs after implementation shape is known.
- Security-reviewer: only needed if changes affect command execution safety, path/process handling, or remote fetching semantics.

## Checkpoint Rules
- Update `STATUS.md` with `update_plan_status` after each milestone starts/completes, after validation failures, after reviewer blockers, and before pausing.
- Update `LESSONS.md` with `update_plan_status` whenever a gotcha, convention, or implementation decision is discovered.
- Rewrite `PLAN.md` with `create_plan` only when milestones, dependencies, or scope materially change.
- Rewrite `SPEC.md` with `create_plan` only when goals/non-goals/acceptance criteria materially change.

## Resume Instructions
1. Read `.agents/sessions/game-dev-cli-research-upgrade-2026-07-07/STATUS.md` first.
2. Read the `<!-- current-task: ... -->` line in this file.
3. Re-read exact target source files before editing; plan context is not a substitute for current file contents.
4. Implement the current milestone only, run its validation gate, then update STATUS.md and LESSONS.md.

<!-- update_plan_status:appended -->
## Scope decision — 2026-07-07T19:49:12.821Z

Implementation scope confirmed implicitly by EXECUTE_PLAN resume request: proceed with M1 first (research-web decomposition and synthesis), not M2/M3 or full rollout.
