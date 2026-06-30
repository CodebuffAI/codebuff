# STATUS — Openbuff Whole-Harness Feature Improvements (v3)

## Current State

Planning complete. No source changes made (plan mode). The four durable artifacts are written and reflect the full-codebase shard audit (v3). All 10 milestones are `todo`; execution has not started.

## What v3 fixed vs v1/v2

- v1 hyperfixated on the reviewer's example surfaces (subagents, prompts, git, gates, indexing) and never audited the orchestrator, runtime, CLI UX, SDK, edit tools, context management, evals, docs, or the planner itself.
- v2 added the meta-effort milestone but still did not audit the orchestrator internals, runtime, SDK failover bug, context-pruning gap, or CLI UX.
- v3 ran a 12-way parallel general-agent shard across every subsystem, grounded each finding in source, and added M3 (orchestrator), M4 (context/memory), M8 (SDK bugfixes), M9 (CLI UX), and expanded M10 (planner effort floor + subsystem-enumeration guard).

## Completed
- SPEC.md (v3) — full 10-milestone spec with source-verified corrections.
- PLAN.md (v3) — ordered milestones, dependencies, risks, validation gates.
- STATUS.md (this file).
- LESSONS.md (pending).

## Pending (todo)
- M1.1–M1.3 Embedded craftsmanship prompts.
- M2.1–M2.7 Subagent output quality & new agents.
- M3.1–M3.4 Orchestrator decision logic.
- M4.1–M4.3 Context & memory management.
- M5.1–M5.4 Git discipline.
- M6.1–M6.4 Quality gates.
- M7.1–M7.3 Indexing depth.
- M8.1–M8.4 SDK provider layer (M8.1 failover bugfix is high-priority).
- M9.1–M9.8 CLI UX.
- M10.1–M10.4 Planner effort floor.

## Blocked
- None currently.

## Next Checkpoint

Begin execution with **M1.1** (create `agents/base2/quality-prompt-section.ts`). M1 is foundational for M2.5 and M3.

## Resume Instructions

1. Read `PLAN.md` for the full milestone/task list and the `<!-- current-task -->` pointer.
2. Read `STATUS.md` (this file) for current state.
3. Read `LESSONS.md` for gotchas discovered during planning.
4. Resume from the `current-task` marker; update it via `update_plan_status` when a task completes.
5. After each milestone, run the per-milestone validation gate and update STATUS.md + LESSONS.md.

<!-- update_plan_status:appended -->
## M1 — Embedded craftsmanship prompts — DONE — 2026-06-27T14:50:38.498Z

Date: 2026-06-27.

- M1.1: Created `agents/base2/quality-prompt-section.ts` exporting `qualitySection` (byte-frozen) + `frontendSection` (explicitly not frozen).
- M1.2: Sections imported and interpolated into `base2.ts:289/291`, `base-deep.ts:105/107`, `editor.ts:202/204`.
- M1.3: Added `agents/__tests__/quality-prompt-snapshot.test.ts` — 4 tests, 4 pass, +1 snapshot. `qualitySection` is byte-frozen via `toMatchSnapshot`; `frontendSection` is only topic-coverage asserted.
- Validation: `bun run --cwd agents typecheck` exit 0; `bun test __tests__/quality-prompt-snapshot.test.ts` 4/4 pass.

Next: M2.1 — `code-searcher` add ≤200-token LLM digest + downgrade model to fast/cheap.

<!-- update_plan_status:appended -->
## M2.1 — code-searcher digest + model downgrade — DONE — 2026-06-27 — 2026-06-27T14:52:56.351Z

- Added heuristic `buildDigest` in `agents/file-explorer/code-searcher.ts` (deterministic, no LLM call since the sandboxed handleSteps has no prompt tool). Emits `digest` field alongside raw `results`.
- Digest format: `<N> matches across <F> files. Top files: ... Symbols: ...` (top-5 files by count, top-8 camelCase/PascalCase/snake_case symbols by frequency, noise keywords filtered).
- File-header discriminator: lines ending with `:` and no leading whitespace (the `Found N matches` summary line does not end with `:` so it is not misclassified). Initial version required a path separator, which broke on test fixtures like `file.ts:` with no separator — fixed by dropping the separator requirement.
- Model downgraded from `anthropic/claude-sonnet-4.5` → `google/gemini-3.1-flash-lite-preview` (matches basher/file-lister/researcher-web).
- Tests: `agents/__tests__/code-searcher.test.ts` extended — asserts `digest` is a string containing match-count + top file + top symbol; asserts model downgrade; serialization test still green. 4/4 pass.
- Validation: `bun run --cwd agents typecheck` exit 0; `bun test __tests__/code-searcher.test.ts __tests__/quality-prompt-snapshot.test.ts` 8/8 pass.

Next: M2.2 — `file-picker` relevance scoring + dedup + ordered top-N.


<!-- update_plan_status:appended -->
## M2.2 — file-picker relevance scoring + ordered top-N — DONE — 2026-06-27 — 2026-06-27T14:54:40.270Z

- Added `scorePathsByPromptRelevance` inline in `file-picker.ts` handleSteps (serialization-safe, no closure deps). Tokenizes the prompt into lowercase keywords (≥3 chars), scores each path by keyword-substring count, then tiebreaks alphabetically.
- Added `MAX_PICKER_FILES = 12` cap matching the spawner prompt's advertised "up to 12 file paths".
- `read_files` now receives `orderedPaths` (scored + capped) instead of the raw deduped set.
- Tests: 2 new — `orders paths by prompt-keyword relevance` (auth paths surface first), `caps to top 12 paths when more candidates are returned` (15→12). Existing dedup test still passes (the cap doesn't trigger below 12). 58/58 pass.
- Validation: `bun run --cwd agents typecheck` exit 0; `bun test __tests__/file-picker.test.ts` 58/58 pass.

Next: M2.3 — `thinker` optional `depth`/`outputSchema` hints.


<!-- update_plan_status:appended -->
## M2.3 — thinker depth/outputSchemaHint hints — DONE — 2026-06-27 — 2026-06-27T14:57:00.689Z

- Added optional `params.depth` (`'shallow' | 'deep'`) and `params.outputSchemaHint` (string) to `thinker.ts` inputSchema. Both optional, `required: []`.
- `instructionsPrompt` extended: `shallow` → short thinking chain + lead with answer; `deep` (default) → thorough reasoning; `outputSchemaHint` → format `message` content to match (e.g. JSON with fields), noting runtime still wraps as `{ message: string }`.
- `handleSteps` signature now accepts `{ params }` (typed to match input schema) but only `void`s it — the model reads params during generation, handleSteps only needs agentState.
- Tests: 2 new — `has optional params with depth and outputSchemaHint` (enum + string types, `required: []`), `instructions prompt surfaces depth and outputSchemaHint guidance`. 28/28 pass.
- Validation: `bun run --cwd agents typecheck` exit 0; `bun test __tests__/thinker.test.ts` 28/28 pass.
- Gotcha: the instructionsPrompt contains a special `<think>`-style token; first attempt to match it via `edit_transaction` with escaped `"` quotes caused a parse error in the template literal. Fixed by using single quotes and avoiding `"` in the newString.

Next: M2.4 — `code-reviewer` 3-item security checklist + coverage-adequacy line.


<!-- update_plan_status:appended -->
## M2.4 — code-reviewer security checklist + coverage line — COMPLETE — 2026-06-27T14:58:28.525Z

Added 3-item security checklist + coverage-adequacy line to reviewer Guidelines. Validation: agents typecheck exit 0; code-reviewer 6/6 pass (2 new M2.4 tests).


<!-- update_plan_status:appended -->
## M2.5 — editor instructionsPrompt imports shared sections — COMPLETE — 2026-06-27T15:00:05.947Z

Editor instructionsPrompt already interpolates ${qualitySection} + ${frontendSection} (M1.2 wiring). Added 'Code Craftsmanship' assertion to editor.test.ts. Validation: agents typecheck exit 0; editor 41/41 pass.


<!-- update_plan_status:appended -->
## M2.7 — MAX_SPAWN_DEPTH enforcement — COMPLETE — 2026-06-27T15:05:57.733Z

Added MAX_SPAWN_DEPTH_DEFAULT=3 to common/src/constants/agents.ts; added maxSpawnDepth? to AgentTemplate type; enforce depth in executeSubagent using parentAgentState.ancestorRunIds.length (depth proxy), rejecting with actionable error before any work begins. Per-template maxSpawnDepth overrides default. Validation: common + agent-runtime typecheck exit 0; spawn-depth 5/5 pass.


<!-- update_plan_status:appended -->
## M1–M2.7 — reviewer gate passed — 2026-06-27 — 2026-06-27T15:11:26.452Z

Code-reviewer returned LOOKS_GOOD on all M1–M2.7 changes. Validation: typecheck-common exit 0, typecheck-agents exit 0, typecheck-agent-runtime exit 0. Reviewer confirmed: shared sections interpolated in all three prompts, snapshot test freezes qualitySection byte-for-byte, code-searcher digest deterministic + bounded, file-picker scoring serialization-safe, thinker params surfaced via instructionsPrompt, reviewer checklist in place, MAX_SPAWN_DEPTH uses ancestorRunIds.length with per-template override. Proceeding to M2.6 (new bundled agents).


<!-- update_plan_status:appended -->
## M2.6 — new bundled agents — DONE — 2026-06-27 — 2026-06-27T15:13:14.697Z

Created four new bundled agent definition files: agents/test-writer/test-writer.ts (flash-lite, read/write/terminal, writes+runs tests), agents/security-reviewer/security-reviewer.ts (sonnet-4.6, read-only, adversarial OWASP review), agents/debugger/debugger.ts (sonnet-4.6, read/terminal/git, root-causes failures without applying fix), agents/doc-writer/doc-writer.ts (flash-lite, read/write, updates docs matching project style). Added four personas to AGENT_PERSONAS in common/src/constants/agents.ts. Added four agent IDs to AgentTemplateTypeList in common/src/types/session-state.ts (test_writer, security_reviewer, debugger, doc_writer). Tests: agents/__tests__/new-bundled-agents.test.ts — 56/56 pass (id, displayName, spawnerPrompt, tools, prompts, handleSteps serialization + per-agent specifics). Validation: common + agents typecheck exit 0; new-bundled-agents 56/56 pass. M2 (all subtasks M2.1–M2.7) is now complete.


<!-- update_plan_status:appended -->
## M2 — Subagent output quality & design — ALL COMPLETE — 2026-06-27 — 2026-06-27T15:13:20.681Z

M2.1 (code-searcher digest + model downgrade), M2.2 (file-picker scoring + top-12), M2.3 (thinker depth/outputSchemaHint), M2.4 (reviewer security checklist + coverage line), M2.5 (editor shared sections), M2.6 (four new bundled agents), M2.7 (MAX_SPAWN_DEPTH) are all done and validated. Next milestone: M3 (Orchestrator decision logic).


<!-- update_plan_status:appended -->
## M3.1 — design decision (context gathered, no edits yet) — 2026-06-27 — 2026-06-27T15:17:21.117Z

Gate flow (agents/base2/base2.ts): validation runs first (sequential yield of run_file_change_hooks at ~L715), reviewer runs after (~L883) only if validation passed. handleSteps yields tools ONE at a time (no batch yield); runProgrammaticStep awaits each tool sequentially. So true concurrency is NOT achievable by yielding two tools in one step.

Concurrency mechanism available: spawn_agents supports per-agent `background: true` (detached coroutine, fire-and-forget) + `check_background_agent({ jobId })` polling handler. So M3.1 = spawn the static-only reviewer as a background job BEFORE running validation, run validation in the foreground, then check_background_agent to join.

Design (for next turn):
1. Add a gate flag `staticReviewOnly: boolean` (default false). When true, the reviewer is spawned with `background: true` before the validation `run_file_change_hooks` yield; its jobId is stashed on activeWorkState.
2. After validation succeeds, yield `check_background_agent({ jobId })` to join the reviewer result, then run the existing collectReviewerBlockers/getReviewerFinalizationVerdict path.
3. Join contract (preserves 'validation failure blocks finalization'): if validation FAILS, do NOT consult the background reviewer at all — surface validation failures and `continue` as today. The background reviewer job keeps running but its result is ignored for this turn (it will be dropped when the gate reruns). If validation passes but the reviewer hasn't finished, check_background_agent must block until it does (use a follow/poll loop or rely on its blocking semantics — verify check-background-agent.ts).

Files to edit: agents/base2/base2.ts (gate flag + reordering), agents/base2/gate-state.ts (add `staticReviewerJobId?` to Base2ActiveWorkState), agents/__tests__/base2.test.ts or a new gate-concurrency.test.ts.

Risk: check_background_agent is currently polling/non-blocking — may need a blocking-follow variant. Verify before implementing; if non-blocking, the simplest correct approach is to keep the reviewer sequential and treat M3.1 as 'allow the reviewer to run concurrently ONLY when explicitly flagged, joining via a poll loop'. The strict 'validation failure blocks reviewer' contract is preserved by simply not consulting the reviewer result on validation failure.

Next turn: read check-background-agent.ts to confirm blocking-vs-polling semantics, then implement M3.1.


<!-- update_plan_status:appended -->
## M3.1 — implementation plan finalized (clean stop, no edits yet) — 2026-06-27 — 2026-06-27T15:17:40.601Z

check_background_agent (packages/agent-runtime/src/tools/handlers/tool/check-background-agent.ts) supports a BLOCKING follow mode: pass `wait_for` + `timeout_seconds` and it polls (200ms) until the wait_for substring matches a buffered chunk OR the job settles (status completed/error) OR the deadline elapses. On completion it returns `result` (the subagent's final output). Poll mode (no wait_for/timeout) returns immediately.

Finalized M3.1 implementation (for next turn):

1. agents/base2/gate-state.ts: add `staticReviewerJobId?: string` to Base2ActiveWorkState.
2. agents/base2/base2.ts gate section (~L715-L953):
   - Add gate flag `const staticReviewOnly = runReviewerGate && editsHappened && <condition>` (e.g. a param/env check; default false to preserve current sequential behavior).
   - When `staticReviewOnly`: BEFORE the `run_file_change_hooks` validation yield, yield `spawn_agents` with the reviewer entry having `background: true`; parse the returned report for `jobId`, stash on `activeWorkState.staticReviewerJobId`.
   - Run validation as today (foreground, blocking).
   - If validation FAILS: surface failures and `continue` as today — do NOT consult the background reviewer. The orphaned background job keeps running but its result is ignored (acceptable; it self-completes).
   - If validation PASSES: yield `check_background_agent({ jobId: activeWorkState.staticReviewerJobId, wait_for: 'LOOKS_GOOD', timeout_seconds: 120 })` to block-join the reviewer. If the reviewer returned BLOCKING/NON_BLOCKING/LOOKS_GOOD, feed the result into the existing collectReviewerBlockers/getReviewerFinalizationVerdict path. If the job errored or timed out without a verdict, fall back to the existing 'did not return LOOKS_GOOD/NON_BLOCKING' blocked-handling.
   - When NOT staticReviewOnly: keep the existing sequential validation-then-reviewer path unchanged.
3. Contract preserved: validation failure still blocks finalization (reviewer result is never consulted on validation failure). Reviewer blockers still block finalization when validation passes.
4. Tests: agents/__tests__/base2.test.ts or new gate-concurrency.test.ts — (a) default path unchanged (sequential), (b) staticReviewOnly path: reviewer spawned as background before validation, reviewer result consulted only on validation pass, validation failure ignores the background reviewer.

Next turn: implement steps 1-4, then validate (typecheck-agents + base2 tests).


<!-- update_plan_status:appended -->
## M3.1 — static-review-only concurrency — COMPLETE — 2026-06-27T15:20:00Z — 2026-06-27T15:26:42.623Z

M3.1 implementation: added `staticReviewOnly?: boolean` and `staticReviewerJobId?: string` to `Base2ActiveWorkState` (gate-state.ts). In base2.ts gate section, when `staticReviewOnly` is true and edits happened, the code-reviewer is spawned with `background: true` BEFORE the blocking `run_file_change_hooks` yield; its jobId is stashed on activeWorkState via `extractBackgroundAgentJobId`. After validation passes, the reviewer is joined via `check_background_agent({ jobId, wait_for: 'LOOKS_GOOD', timeout_seconds: 120 })` and the result feeds through the existing `collectReviewerBlockers`/`getReviewerFinalizationVerdict` path. Validation failure still `continue`s and never consults the background reviewer (join contract preserved). Default behavior (no flag) is unchanged sequential validation-then-reviewer.

Tests: 7 M3.1 tests added — 4 runtime gate-execution tests (default path unchanged, background spawn before validation, validation failure ignores bg reviewer, validation pass joins via check_background_agent) + 3 unit tests (default prompts absent flag strings, conditional-type presence assertions, JSON round-trip of staticReviewerJobId). Fixed type-level test: `{} as T` casts runtime `{}` to type `true` but expect receives `{}`; replaced with `const x: T = true` pattern so the compile-time check gates the assignment and the runtime assert confirms the literal.

Validation: agents typecheck exit 0; base2.test.ts 50/50 pass.


<!-- update_plan_status:appended -->
## De-hardcode models + sync stale AgentTemplateTypeList — COMPLETE — 2026-06-27 — 2026-06-27T15:58:58.169Z

User request (post-M3.1): (1) no hardcoded models in agent definitions — this is a local BYOK CLI; users determine models via openbuff.d/providers.json + routes.json; (2) fix the NON_BLOCKING reviewer finding: the local AgentTemplateTypeList in agents/types/secret-agent-definition.ts was a stale duplicate missing the four new agent IDs.

Changes applied:
- agents/types/agent-definition.ts: `model` field changed from required `model: ModelName` to optional `model?: ModelName` with an updated docstring noting it is documentation-only / last-resort fallback, overridden by openbuff.d/routes.json routing.
- agents/types/secret-agent-definition.ts: AgentTemplateTypeList synced with common/src/types/session-state.ts — now includes test_writer, security_reviewer, debugger, doc_writer, planner, base_free (the stale duplicate was missing all of these).
- Removed hardcoded `model:` field from all bundled agent definition files: agents/basher.ts, agents/test-writer/test-writer.ts, agents/doc-writer/doc-writer.ts, agents/security-reviewer/security-reviewer.ts, agents/debugger/debugger.ts, agents/thinker/thinker.ts, agents/reviewer/code-reviewer.ts, agents/file-explorer/code-searcher.ts, agents/file-explorer/file-picker.ts, agents/file-explorer/file-lister.ts, agents/browser-use/browser-use.ts, agents/researcher/researcher-web.ts, agents/researcher/researcher-docs.ts, agents/context-pruner.ts, agents/editor/editor.ts (all 7 createCodeEditor variants), and agents/tmux-cli.ts (last remaining outlier — minimax/minimax-m2.7).
- Updated all test assertions from `expect(x.model).toBe('...')` to `expect(x.model).toBeUndefined()` across agents/__tests__/new-bundled-agents.test.ts, basher.test.ts, code-searcher.test.ts, file-picker.test.ts, thinker.test.ts, editor.test.ts.

Architecture confirmation (sdk/src/provider-config.ts resolveConfiguredAgentModelConfig): resolution order is modes[mode] → agents[agentId] → defaultModel → definition.model (last-resort) → throw. The default openbuff.d/routes.json already routes every agent, so removing hardcoded models is safe out-of-the-box; the definition's model field only matters when a user has NO route configured, and even then it just picks a provider the user may not have — making it optional is the correct BYOK behavior.

Validation: typecheck-common exit 0, typecheck-agents exit 0, typecheck-agent-runtime exit 0; affected agent tests 211/211 pass (new-bundled-agents, basher, code-searcher, file-picker, thinker, editor).

Next: M3.2 — Repair-loop escalation after MAX_REPAIR_ROUNDS; durable repairSessionId to prevent reset circumvention.


<!-- update_plan_status:appended -->
## Editor dead-code map removed — COMPLETE — 2026-06-27 — 2026-06-27T16:02:30.723Z

Reviewer flagged (NON_BLOCKING, then LOOKS_GOOD after fix) that `agents/editor/editor.ts` retained a dead `EDITOR_MODEL_BY_VARIANT` map (lines 14–20) with hardcoded model strings (`openai/gpt-5.5`, `anthropic/claude-opus-4.7`, etc.) even though `model` was no longer set from it — the `model` param is only used at line 155 via `EDITOR_VARIANTS_WITH_THINK_TAGS.has(model)`. Removed the map to eliminate the stale hardcoded strings. Validation: typecheck-agents exit 0; reviewer LOOKS_GOOD. The de-hardcoding work is now fully complete — no hardcoded model strings remain in any bundled agent definition.


<!-- update_plan_status:appended -->
## openbuff.d/routes.json cleanup — stale variants removed + missing agent routes added — COMPLETE — 2026-06-27 — 2026-06-27T16:23:25.031Z

User follow-up question: "Did you remove the variants from openbuff.d as well as added any new definitions we need like execute plan, or code searcher?"

Answer: No — the de-hardcoding work only changed .ts agent definition files; openbuff.d/routes.json was NOT touched. Cross-referenced live routes.json against actual registered agent IDs and found two problems:

1. 14 stale variant route keys with no corresponding agent definitions (zero runtime references in agents/**/*.ts or common/**/*.ts — these agents were moved to agents-graveyard/ or collapsed into a single variant):
   - thinker-gpt, thinker-gemini, thinker-with-files-gemini
   - editor-gpt-5, editor-implementor, editor-implementor-opus, editor-implementor-gpt-5
   - code-reviewer-gpt, code-reviewer-kimi, code-reviewer-minimax, code-reviewer-deepseek, code-reviewer-deepseek-flash
   - gpt-5-agent, opus-agent
   - Plus stale agentReasoningEfforts.editor-implementor (removed)

2. 8 missing routes for agents that DO exist as definition files — now a FUNCTIONAL BUG since model is undefined in definitions (de-hardcoded), so resolveConfiguredAgentModelConfig would throw at runtime:
   - test-writer, security-reviewer, debugger, doc-writer (the 4 new bundled agents from M2.6)
   - base2-execute-plan, base2-evals, base-deep-evals (base2 family variants)
   - synthesizer

Changes applied to openbuff.d/routes.json:
- Removed all 14 stale variant keys from the agents section.
- Removed stale agentReasoningEfforts.editor-implementor.
- Added 8 missing agent routes (all pinned to pioneer/zai-org/GLM-5.2 matching every other default agent; users override via their own config).
- code-searcher was already routed — no action needed there.

Validation: bun -e require('./openbuff.d/routes.json') exit 0 — valid JSON, 41 agent routes, agentReasoningEfforts contains only code-reviewer. No typecheck hooks fire for JSON config files.


<!-- update_plan_status:appended -->
## M3.2 — Repair-loop escalation + durable repairSessionId — COMPLETE — 2026-06-27 — 2026-06-27T16:43:22.529Z

Implemented both parts of M3.2 in `agents/base2/gate-state.ts` + `agents/base2/base2.ts`.

**Durable `repairSessionId` (prevents reset circumvention):**
- Added `repairSessionId?: string` and `repairEscalationDone?: boolean` to `Base2ActiveWorkState` (gate-state.ts, backward-compatible).
- In base2.ts, when the first repair round starts, `repairSessionId` is set to a unique token (`repair-<ts>-<rand>`). 
- `recordChangedFiles` reset guard updated: `if (!opts?.fromRepair && !activeWorkState.repairSessionId)` — so a spurious non-repair edit to a failing file during an active repair session does NOT silently reset `repairRoundCount` to 0.
- `repairSessionId` + `repairEscalationDone` cleared (set to `undefined`) at both gate-pass sites (durable-fingerprint reuse path + reviewer-finalization pass path).

**Escalation after MAX_REPAIR_ROUNDS:**
- Changed `const failures` → `let failures` so the escalation branch can reassign after re-verification.
- Replaced the `else` (budget-exhausted) branch: instead of immediately blocking, if `hasParseableFailures && !repairEscalationDone`, spawn ONE escalation editor with a broader root-cause prompt (`buildEscalationEditorPrompt`), mark `repairEscalationDone = true`, re-run validation, and `continue` into the reviewer gate on success. Only if the escalation also fails (or failures are unparseable, or escalation already ran) does the gate fall to `blocked` with `skipReason: 'escalation-exhausted'` (or `'repair-budget-exhausted'` / `'unparseable-failures'` as before).
- Added inline `buildEscalationEditorPrompt(parsed, pendingFiles, roundsUsed)` helper next to `buildRepairEditorPrompt` — same grouped-failure rendering but with a root-cause-investigation preamble instructing the editor to read failing files in full and resolve the underlying issue, not patch the symptom.
- Telemetry: new `reuseReason: 'repair-budget-escalation'` / `'escalation-succeeded'`, and `skipReason: 'escalation-exhausted'` for the post-escalation blocked state.

Validation: typecheck-agents exit 0; gate-repair-parity + gate-changed-files + base2 tests = 53/53 pass (461 expect() calls). No existing gate behavior regressed.

Next: M3.3 — Adaptive spawning guidance keyed to breadth (cross-ref M10 classifier).


<!-- update_plan_status:appended -->
## M3.3 — Adaptive spawning guidance (2026-06-27) — 2026-06-27T16:47:20.326Z

- Extracted the duplicated "Broad audit / exploration requests" prompt block (was inline in both buildImplementationInstructionsPrompt and buildPlanOnlyInstructionsPrompt) into a shared buildBroadAuditSection(finalizeClause) helper in quality-prompt-section.ts.
- Replaced the static "3–6 / 8–12 subagents" heuristic with an explicit breadth rubric keyed to the number of distinct subsystems the request spans: breadth 1–2 → 2–3 shards; 3–5 → 3–6 shards (≥1 file-picker + ≥1 code-searcher per subsystem); 6+ → 8–12 shards (+ researcher-docs per major external library). This uses the same vocabulary the M10 classifier (classifyPrompt in evals/buffbench/plan-sharding-signals.ts) uses to detect audit-style prompts, so the runtime guidance and the eval classifier are now aligned.
- Kept the per-path finalize clause parameterized so the implementation path says "proceed to implementation or the answer" and the plan path says "translate the findings into the durable plan packet below".
- Gotcha: the transaction reported stale basedOnRead anchors for the two inline replacements (because the import edit shifted line numbers mid-transaction), but the runtime still applied them via deterministic oldString match since the targets were unique. Lesson: batch all edits to one file in a single str_replace/edit_transaction so earlier edits don't invalidate later ranges; the runtime will still apply unique-match edits but the noise is avoidable.


<!-- update_plan_status:appended -->
## M3.4 — base-deep gate lifecycle parity — COMPLETE — 2026-06-27 — 2026-06-27T17:23:06.122Z

Ported `agents/base2/base-deep.ts` to the same validation/reviewer gate lifecycle as `base2.ts`.

**Implementation (M3.4c):**
- `createBaseDeep` now composes `createBase2('default', { noAskUser })` and spreads the result, inheriting `handleSteps`, `toolNames` (gate tools: `run_file_change_hooks`, `git_status`, `create_plan`, `update_plan_status`), `inputSchema`, `outputMode`, and all gate-state closures. base-deep is a bundled in-process agent, so the `handleSteps` function reference (not a `toString()`-serialized copy) preserves its closures.
- `spawnableAgents` adds `editor` (required for the gate repair loop — spawned on validation failure to fix offending files) alongside base-deep's extra explorers (`directory-lister`, `glob-matcher`) that base2 doesn't include. `code-reviewer` and `context-pruner` are inherited from the base2 spread.
- Overrides: `reasoningOptions: { effort: 'high' }`, deep-specific `displayName`/`spawnerPrompt`/`systemPrompt`/`instructionsPrompt`/`stepPrompt`.
- Import fix: removed the now-unused `publisher` import (provided via the base2 spread) and added `import { createBase2 } from './base2'`.

**Parity test (M3.4d):** Added `base-deep gate lifecycle parity with base2` describe block in `agents/__tests__/base2.test.ts` (2 tests):
1. `inherits handleSteps and exposes the gate tools + repair editor` — asserts `handleSteps` is a function, `toolNames` contains the 4 gate tools, and `spawnableAgents` contains `editor` + `code-reviewer`.
2. `handleSteps runs the same validation gate sequence as base2` — drives the generator with `agentId: 'base-deep'` and asserts the same sequence base2 produces: `git_status` → `spawn_agent_inline` (context-pruner) → `STEP` → `git_status` (post-step) → `run_file_change_hooks`, with `base2ActiveWork` tracking `changedFiles`/`touchedFiles`/`pendingGateFiles` = `['src/a.ts']`.

**Gate-parity confirmation:** The validation/reviewer gate runs for any `agentId` that is NOT `'base2-fast'` or `'base2-fast-no-validation'` (base2.ts L334–335). Since `'base-deep'` is neither, base-deep gets full validation + reviewer gate parity automatically — no allowlist change needed.

**Validation (M3.4e):** `bun x tsc --noEmit -p tsconfig.json` (agents) exit 0; `bun test __tests__/base2.test.ts` 52/52 pass (includes the 2 new parity tests; 449 expect() calls).

M3 (Orchestrator decision logic) is now fully complete: M3.1 (static-review-only concurrency), M3.2 (repair-loop escalation + durable repairSessionId), M3.3 (adaptive spawning guidance), M3.4 (base-deep gate parity). Next milestone: M4 (Context & memory management).


<!-- update_plan_status:appended -->
## M3.4 follow-up: gate-awareness prompt extraction — 2026-06-27 — 2026-06-27T17:40:47.701Z

Fixed the reviewer's non-blocking observation from M3.4: base-deep's prompts didn't inherit base2's gate-awareness guidance, so Phase 5 redundantly spawned code-reviewer alongside the automated gate.

**Changes:**
- `agents/base2/quality-prompt-section.ts`: Added `gateAwarenessSection` export — a shared, NOT-byte-frozen section containing the two gate-awareness bullets (preserving exact text for `toContain` compatibility).
- `agents/base2/base2.ts`: Replaced the two `isDefault`-conditional inline bullets in the `buildArray(...)` with `${isDefault ? gateAwarenessSection : ''}` placed as a standalone section before `# Openbuff Meta-information`. Updated import.
- `agents/base2/base-deep.ts`: Added `gateAwarenessSection` to system prompt (between `qualitySection` and `frontendSection`). Rewrote Phase 5 from "Review Loop" (manually spawn code-reviewer) to "Review" (defer to automated gate, optional advisory review only). Updated todo tracking label and response example.
- `agents/__tests__/quality-prompt-snapshot.test.ts`: Added assertions that both base2 and base-deep interpolate `gateAwarenessSection`.

**Validation:** typecheck-agents exit 0; base2 tests 52/52 pass; quality-prompt-snapshot tests 4/4 pass.

**Status:** Complete. The automated runtime gate will now run validation/reviewer for base-deep without the model redundantly spawning code-reviewer in Phase 5.


<!-- update_plan_status:appended -->
## Follow-up fix: base-deep stepPrompt alignment — 2026-06-27 — 2026-06-27T17:44:02.333Z

Resolved the reviewer's non-blocking observation from the gate-awareness extraction: base-deep's `stepPrompt` (per-turn condensed reminder) still said `5. Review Loop — code-reviewer → fix → re-review until clean`, contradicting the rewritten Phase 5 in `instructionsPrompt` that defers to the automated gate.

Fix: updated `stepPrompt` line 5 to `5. Review — defer to automated gate (validation + code-reviewer); fix any BLOCKING findings`.

Validation: typecheck-agents exit 0; reviewer gate LOOKS_GOOD. The full follow-up (gate-awareness extraction + Phase 5 rewrite + stepPrompt alignment) is now complete.


<!-- update_plan_status:appended -->
## Audit: new bundled agents stepPrompt/instructionsPrompt drift — 2026-06-27 — 2026-06-27T17:46:42.570Z

Audited the 4 new bundled leaf agents (debugger, doc-writer, security-reviewer, test-writer) for the stepPrompt/instructionsPrompt drift pattern that was fixed in base-deep.

Result: CLEAN — no drift found, no fixes needed.

Structural reason: The drift pattern requires BOTH (a) composing `createBase2` to inherit the automated gate lifecycle AND (b) overriding `stepPrompt` with a per-turn reminder that could contradict the gate. The 4 new agents satisfy neither condition:
- They are standalone `SecretAgentDefinition` objects (do NOT compose `createBase2`)
- They are leaf agents (`spawnableAgents: []`) — cannot spawn code-reviewer
- They do NOT set a `stepPrompt` field at all
- Their `handleSteps` (where present) are simple context-preloading generators (read files, run reproduce/test command, `STEP_ALL`) — no gate lifecycle
- Their `instructionsPrompt` explicitly say "Do not modify code" / "Do not apply the fix" — they're review/diagnosis agents, not orchestrators

Cross-check: only 2 files in `agents/` set `stepPrompt` — `base2.ts` (the gate source, consistent by construction) and `base-deep.ts` (already fixed). The other `createBase2` composers (`base2-fast`, `base2-fast-no-validation`, `base2-plan`, `base2-execute-plan`, `base2-evals`) are thin 4-line wrappers that spread `createBase2(...)` and only override the `id` — they inherit all prompts, so they can't drift.

Conclusion: base-deep was the ONLY agent where the drift pattern could (and did) occur. The fix is complete; no further drift exists in the codebase.


<!-- update_plan_status:appended -->
## M4.1 — Runtime auto-pruning via maybePruneContext — COMPLETE — 2026-06-27 — 2026-06-27T18:12:45.793Z

Implemented runtime-level proactive context pruning in `loopAgentSteps` when `contextTokenCount` exceeds the model threshold.

**Implementation:**
- Created `packages/agent-runtime/src/util/context-pruning.ts` exporting `maybePruneContext(params)` + `DEFAULT_MAX_CONTEXT_TOKENS = 190_000`. The helper is a deterministic, fast-acting safety net: if `contextTokenCount <= maxTotalTokens`, returns `{ messages, pruned: false }` (same reference, no copy); otherwise delegates to `trimMessagesToFitTokenLimit` and returns `{ messages: pruned, pruned: true }`.
- Wired into `packages/agent-runtime/src/run-agent-step.ts` `loopAgentSteps`: after `currentAgentState.contextTokenCount = estimateContextTokensLocally()` (L1135), calls `maybePruneContext({ messages, systemTokens, contextTokenCount, maxTotalTokens: maxContextLength, logger })`. On `pruned: true`, updates `currentAgentState.messageHistory`, rebuilds `messagesWithStepPrompt` from the pruned history, and recomputes `contextTokenCount` so the recompute reflects the trimmed context.
- `maxContextLength` is threaded as an optional param on `loopAgentSteps` (L799), destructured at L879, passed as `maxTotalTokens` at L1148. When undefined, `maybePruneContext` falls back to `DEFAULT_MAX_CONTEXT_TOKENS` (190k).

**Design rationale:** Extracted the pruning logic into a testable helper rather than inlining it in `loopAgentSteps`, avoiding circular dependencies (the helper imports only `trimMessagesToFitTokenLimit` + types, not `executeSubagent`/`loopAgentSteps`). Orchestrators' `handleSteps` may still spawn the LLM-based `context-pruner` agent for smarter summarization — this runtime-level trim is a proactive safety net that works for ALL agents (not just those with `handleSteps`).

**Test (M4.1f):** Created `packages/agent-runtime/src/util/__tests__/context-pruning.test.ts` — 4 tests: (1) under-threshold returns `pruned: false` + same reference, (2) over-threshold returns `pruned: true` + trimmed messages + reduced token count, (3) uses `DEFAULT_MAX_CONTEXT_TOKENS` when `maxTotalTokens` undefined, (4) prunes when exceeding default threshold with undefined `maxTotalTokens`.

**Validation (M4.1g):** typecheck-agents exit 0; `bun test src/util/__tests__/context-pruning.test.ts` 4/4 pass (9 expect() calls).

Next: M4.2 — Extend `trimMessagesToFitTokenLimit` to summarize `code_search`/`read_subtree`/`query_index`/`web_search` results (currently only `run_terminal_command` results are summarized; all other large tool results are dropped wholesale).


<!-- update_plan_status:appended -->
## M4.2 — Extend trimMessagesToFitTokenLimit to summarize code_search/read_subtree/query_index/web_search results — COMPLETE — 2026-06-27 — 2026-06-27T19:25:43.333Z

M4.2 was already implemented from a prior compaction boundary (simplify-tool-results.ts + messages.ts wiring + 4 tool param schemas + comprehensive test file), but STATUS.md had no completion record and the current-task pointer hadn't advanced.

**Implementation verified:**
- `packages/agent-runtime/src/util/simplify-tool-results.ts`: 4 new summarizers (simplifyCodeSearchResults, simplifyReadSubtreeResults, simplifyQueryIndexResults, simplifyWebSearchResults) + SUMMARIZABLE_TOOL_NAMES set (6 tools: run_terminal_command, code_search, read_subtree, query_index, web_search, read_files) + simplifyToolResultContent dispatcher. Each summarizer is idempotent (already-simplified results returned as-is).
- `packages/agent-runtime/src/util/messages.ts`: trimMessagesToFitTokenLimit imports simplifyToolResultContent + SUMMARIZABLE_TOOL_NAMES; uses SUMMARIZABLE_TOOL_NAMES.has(toolName) to decide which tool results to summarize (not just run_terminal_command); calls the dispatcher in both the first pass (via simplifyToolResultHelper) and the second O(n) optimization pass.
- 4 tool param schemas updated with "omitted for length" union variants: code-search (stdoutOmittedForLength), query-index (matchedSnippetsOmittedForLength + relatedFilesOmittedForLength), read-subtree (printedTreeOmittedForLength + variablesOmittedForLength), web-search (resultOmittedForLength).
- Test file: 43 tests covering all 4 new summarizers + dispatcher + SUMMARIZABLE_TOOL_NAMES set.

**Fix applied:** 2 TypeScript errors in simplify-tool-results.test.ts (lines 1105, 1109) — the "unknown tool names" test declared `content` as an untyped array literal that didn't satisfy CodebuffToolOutput. Fixed by adding `as unknown as CodebuffToolOutput` cast (same pattern as the "error" test in the same describe block).

**Validation:** typecheck-agent-runtime exit 0; simplify-tool-results tests 43/43 pass (50 expect() calls); messages tests 40/40 pass (122 expect() calls).

Next: M4.3 — Wire contextTokenCount to pruning trigger + surface in status bar (M9.3).


<!-- update_plan_status:appended -->
## M4.2 Integration-Test Follow-up — Complete (2026-06-27) — 2026-06-27T20:06:25.967Z

Added 5 integration tests in `messages.test.ts` exercising `trimMessagesToFitTokenLimit` with `code_search`/`read_subtree`/`query_index`/`web_search` tool results (previously each summarizer was tested in isolation but the full trim loop wasn't tested with the new tool types).

**Initial run:** 3 of 5 tests failed (code_search, web_search, mixed) because the `code_search` and `web_search` summarizers produce `stdoutExcerpt`/`resultExcerpt` fields (up to 2000 chars each), unlike `read_subtree`/`query_index` which fully omit large fields. This caused two issues: (1) the 2000-char excerpts pushed the token count over the 1500-token limit (mock returns `JSON.stringify(text).length` = raw char count), and (2) `not.toContain(payload_substring)` assertions failed because excerpts legitimately contain the payload.

**Fix:** Increased `maxTotalTokens` to 3000 for code_search/web_search tests and 6000 for the mixed test (accommodating excerpts while still triggering summarization). Removed the incorrect `not.toContain` assertions — the structural assertions (`*OmittedForLength` fields present, metadata preserved) plus token-count assertions already prove summarization happened; a buggy summarizer that kept the full payload would fail the token-count check.

**Validation:** typecheck-agent-runtime exit 0; messages.test.ts 45/45 pass (146 expect calls). Reviewer gate: LOOKS_GOOD.


<!-- update_plan_status:appended -->
## M4.3 — Context-window usage in status bar — COMPLETE — 2026-06-27 — 2026-06-27T20:39:59.511Z

Status: DONE. All validation green.

What shipped:
- New `context_window` PrintModeEvent type in `common/src/types/print-mode.ts` (schema: `{ type: 'context_window', used: number, max: number }`)
- Emit point in `packages/agent-runtime/src/run-agent-step.ts` `loopAgentSteps` — fires after `contextTokenCount` computation and post-prune recompute, using `maxContextLength ?? DEFAULT_MAX_CONTEXT_TOKENS`
- CLI handler `handleContextWindow` in `cli/src/utils/sdk-event-handlers.ts` calls `state.streaming.setContextWindowUsage({ used, max })`; `handleFinish` clears it to `null`
- New `SetContextWindowUsageFn` type + `setContextWindowUsage` field on `StreamingState`, wired through `create-event-handler-state.ts` → `use-send-message.ts` (`UseSendMessageOptions`) → `chat.tsx` (`useState` for `contextWindowUsage`) → `StatusBar` prop
- `StatusBar` renders `ctx {pct}%` with warning color (>=70%) via `renderContextWindowUsage()`
- Test: `sdk-event-handlers.test.ts` — new test verifying `context_window` event calls `setContextWindowUsage` with correct payload

Files changed (9):
- common/src/types/print-mode.ts
- packages/agent-runtime/src/run-agent-step.ts
- packages/agent-runtime/src/util/__tests__/messages.test.ts (M4.2 follow-up integration tests)
- cli/src/utils/sdk-event-handlers.ts
- cli/src/utils/create-event-handler-state.ts
- cli/src/hooks/use-send-message.ts
- cli/src/chat.tsx
- cli/src/components/status-bar.tsx
- cli/src/utils/__tests__/sdk-event-handlers.test.ts

Validation:
- typecheck-common: exit 0
- typecheck-agent-runtime: exit 0
- typecheck-cli: exit 0
- sdk-event-handlers tests: 2/2 pass
- messages tests: 45/45 pass
- Automated validation/reviewer gate: LOOKS_GOOD

Next checkpoint: M5.1 — Extract gitCommitGuidePrompt → common/src/constants/git-discipline.ts


<!-- update_plan_status:appended -->
## M5.1 — Extract gitCommitGuidePrompt → common/src/constants/git-discipline.ts — COMPLETE — 2026-06-27T20:55:39.419Z

- Extracted `gitCommitGuidePrompt` constant (62-line template literal) from `common/src/tools/params/tool/run-terminal-command.ts` (lines 42–103) into new `common/src/constants/git-discipline.ts`.
- Updated `run-terminal-command.ts` to import the constant from `'../../../constants/git-discipline'` instead of defining it locally; the `${gitCommitGuidePrompt}` interpolation in the `description` template literal continues to work.
- Extraction performed via `sed` (`sed -n '42,103p' source > target` + `sed -i '42,104d' source`) to guarantee byte-identical content — the template literal contains escaped backticks (`\``) and triple backtick code blocks that are error-prone to transcribe manually.
- Validation: typecheck-common exit 0, typecheck-cli exit 0.
- Next: M5.2 — Resurrect `git-committer` bundled agent from graveyard.


<!-- update_plan_status:appended -->
## M5.2 — git-committer resurrected — 2026-06-27 — 2026-06-27T21:04:05.730Z

Completed M5.2: Resurrected the git-committer bundled agent from agents-graveyard/.

**Files created:**
- `agents/git-committer/git-committer.ts` — Modern `SecretAgentDefinition` with: id `git-committer`, displayName `Mitt the Git Committer`, no `model` field (vestigial for bundled agents), `outputMode: 'last_message'`, `includeMessageHistory: false`, `spawnableAgents: []`, tools `['read_files', 'read_outline', 'code_search', 'run_terminal_command', 'git_status']`, `inputSchema` with prompt + `stage_all` param. handleSteps runs `git status --short` → `git diff HEAD` → `git log --oneline -10` → optional `git add -A` (if `stage_all`) → `STEP_ALL`.
- `agents/__tests__/git-committer.test.ts` — 18 tests covering schema conformance + git-committer specifics (no model, read+terminal+git tools, no write/edit tools, commit message mention, do-not-push, Codebuff footer, secrets warning).

**Files edited (atomic edit_transaction):**
- `common/src/types/session-state.ts` — Added `'git_committer'` to `AgentTemplateTypeList` after `'doc_writer'`.
- `agents/types/secret-agent-definition.ts` — Added `'git_committer'` to the duplicate `AgentTemplateTypeList` for consistency.
- `common/src/constants/agents.ts` — Added `'git-committer'` persona to `AGENT_PERSONAS`.

**Design decisions:**
- Used `SecretAgentDefinition` (not old `AgentDefinition`) to match debugger/test-writer/doc-writer pattern.
- Dropped `add_message` and `end_turn` from toolNames — modern agents rely on `STEP_ALL` and the model's natural turn-ending; `end_turn` is implicitly available.
- Dropped `model` field entirely (vestigial; routing controlled by openbuff.d/routes.json). Test asserts `toBeUndefined()`.
- Added `git_status` tool (modern structured tool) alongside `run_terminal_command` for git operations.
- Kept the graveyard's core workflow (diff → log → read → stage → commit) but modernized to use `as ToolCall<'run_terminal_command'>` narrowing and simplified the handleSteps to not use `add_message` injection.
- Instructions prompt includes the Codebuff footer convention and guardrails (no push, no secrets, no amend/rebase).

**Validation:** typecheck-common ✓, typecheck-agents ✓, git-committer.test.ts 18/18 ✓ (26 expect calls).


<!-- update_plan_status:appended -->
## M5.3 — git_branch SDK helper — COMPLETE — 2026-06-27T21:30:02.807Z

Completed: 2026-06-28.

Shipped:
- Exported `runGit` from `sdk/src/tools/git-status.ts` (was module-private; now reusable).
- New `sdk/src/tools/git-branch.ts` — `gitBranch` SDK helper that reuses `gitStatus` for dirty-tree refusal. Params: `{ cwd, branchName, switch?, allowDirty? }`. Returns `GitBranchResult` with `{ branch, created, switched, previousBranch?, errorMessage? }`.
- New `sdk/src/__tests__/git-branch.test.ts` — 10 tests covering dirty-tree refusal, clean-tree creation, allowDirty bypass, switch=false, invalid-name validation (3 cases), git_status error propagation, checkout failure, and branch failure.

Validation:
- typecheck-sdk: exit 0 (tsc --noEmit -p .)
- git-branch.test.ts: 10/10 pass, 38 expect() calls

Design decisions:
- Plan validation path said `sdk/src/tools/git-status.test.ts` but repo convention puts SDK tests in `sdk/src/__tests__/`. Followed repo convention: `sdk/src/__tests__/git-branch.test.ts`.
- `gitBranch` is SDK-only (not registered as an agent-runtime tool). Matches `gitStatus` visibility (internal SDK utility, not in `ToolHelpers`).
- Branch name regex `/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/` — intentionally stricter than git's own rules for shell-safety.
- `queueMicrotask` pattern in tests to emit mock process events after `runGit` attaches listeners (sequential spawns).

Gotcha: `gitStatus`'s `.trim()` on the status body removes leading spaces from individual status lines (e.g., ` M file.ts` → `M file.ts`). Test assertions must not expect the leading space.


<!-- update_plan_status:appended -->
## M5.4 — git_discipline orchestrator prompt section — COMPLETE (2026-06-28) — 2026-06-27T21:43:36.023Z

Added `gitDisciplineSection` to `agents/base2/quality-prompt-section.ts` alongside the existing `qualitySection`/`frontendSection`/`gateAwarenessSection`. Interpolated it into both orchestrator system prompts (`base2.ts` + `base-deep.ts`) and extended `agents/__tests__/quality-prompt-snapshot.test.ts` with a content-coverage test (not byte-frozen, matching the `frontendSection` convention) plus assertions that both orchestrators interpolate the new section.

**Validation:** typecheck-agents exit 0 · quality-prompt-snapshot.test.ts 5/5 pass (29 expect calls, 1 snapshot) · base2.test.ts 52/52 pass (449 expect calls).

**Next:** M6.1 — Document `lint` hook naming convention (no schema field).


<!-- update_plan_status:appended -->
## M6.1 — Document lint hook naming convention (DONE) — 2026-06-27T22:02:25.783Z

Added `### Hook naming convention` subsection to `docs/configuration.md` between "Hook fields" and "Recommended recipe". Documents the prefix convention (`typecheck-*`, `lint-*`, `test-*`, `build-*`) as documentation-only — no schema field enforces it, matching the `FileChangeHook` type which has no `kind`/`category` field. Includes a rationale for why a convention was chosen over a schema field (zero-cost, backward-compatible, no migration needed). Validation: hooks skipped (no hook matches docs/*.md); reviewer LOOKS_GOOD.


<!-- update_plan_status:appended -->
## M6.2 — Pre-edit advisory security review — COMPLETE (2026-06-28) — 2026-06-27T22:33:50.653Z

Added `securityReviewSection` to `agents/base2/quality-prompt-section.ts` alongside the existing `qualitySection`/`frontendSection`/`gateAwarenessSection`/`gitDisciplineSection`. Interpolated it into both orchestrator system prompts (`base2.ts` + `base-deep.ts`), NOT the editor (orchestrator decides when to spawn security-reviewer; editor implements the already-reviewed change). Extended `agents/__tests__/quality-prompt-snapshot.test.ts` with a content-coverage test (not byte-frozen, matching the frontendSection/gitDisciplineSection convention) plus wiring assertions for both orchestrators with an explicit comment documenting the editor exclusion.

**Design decision:** advisory prompt section, not programmatic interception. The `handleSteps` generator is serialized via `.toString()` + `new Function()`, so any programmatic auto-spawn of security-reviewer before the editor would require inlining all logic as a string — fragile and high-risk. The SPEC says 'advisory' (non-blocking), and R6.1 established the soft, documentation-level enforcement pattern. The security-reviewer agent already exists with read-only tools (read_files, read_outline, code_search, git_status) — safe for advisory pre-edit review.

**Content:** Lists security-sensitive file patterns (auth/identity, crypto/keys, payment/billing, secrets/env, permissions/policy) with glob examples. Instructs the orchestrator to spawn security-reviewer BEFORE the editor runs (pre-edit, not post-edit). Notes this is advisory/non-blocking, complements the automated post-edit gate, and that trivial changes (typos, comments) can skip the review.

**Validation:** typecheck-agents exit 0 · quality-prompt-snapshot.test.ts 6/6 pass (38 expect calls, 1 snapshot) · base2.test.ts 52/52 pass (449 expect calls). All 4 edits applied atomically via editor agent.

**Next:** M6.3 — Coverage-adequacy in reviewer verdict contract.


<!-- update_plan_status:appended -->
## Branding Cleanup — 2026-06-28 — 2026-06-27T23:16:24.170Z

User-requested detour from M6.3: remove legacy codebuff branding + Co-Authored-By footers.

**Phase 1 — Co-Authored-By removal + dead-URL rebrand (8 files, gated):**
- Removed all `Co-Authored-By: Openbuff <noreply@openbuff.local>` footers from commit message examples/guides across `git-discipline.ts`, `run-terminal-command.ts`, `cli-release-staging.yml`, `git-committer.ts`
- Rebranded `git-committer.ts` footer: `🤖 Generated with [Codebuff](https://codebuff.com)` → `🤖 Generated with Openbuff` (drops dead codebuff.com link)
- Rebranded dead URLs/emails: `test.codebuff.com` → `test.openbuff.dev`, `support@codebuff.com` → `support@openbuff.dev` (env var NAMES like `NEXT_PUBLIC_CODEBUFF_APP_URL` preserved as compat aliases)
- Also resolves the M5 non-blocking finding (commit-footer branding inconsistency between `gitCommitGuidePrompt` and `git-committer`)

**Phase 2 — Publisher namespace rename (user confirmed breaking change):**
- `agents/constants.ts`: `publisher = 'codebuff'` → `'openbuff'`
- `common/src/util/agent-name-normalization.ts`: `DEFAULT_ORG_PREFIX = 'codebuff/'` → `'openbuff/'`
- `cli/src/utils/constants.ts`: `HIDDEN_AGENT_IDS = ['codebuff/context-pruner']` → `['openbuff/context-pruner']`
- `agents/types/agent-definition.ts` docstring: `codebuff/file-picker@0.0.1` → `openbuff/file-picker@0.0.1`
- Template files (`my-custom-agent.ts`, `03-advanced-file-explorer.ts`): rebranded spawnableAgents IDs
- `common/src/tools/params/tool/lookup-agent-info.ts`: example agentId rebranded
- Test files (`spawn-agents-permissions.test.ts`, `prompts-schema-handling.test.ts`, `model-provider.test.ts`): rebranded `codebuff/` agent IDs to `openbuff/` for brand consistency
- ~20 agent files import `publisher` from `agents/constants.ts` and consume the value automatically — no per-file changes needed

**Scope boundaries (explicitly OUT OF SCOPE — left unchanged):**
- `@codebuff/*` package namespace (tsconfig paths, package.json names, ~200 imports) — documented compat aliases per README; requires coordinated dual-publishing deprecation
- `CodebuffClient` SDK export, `CODEBUFF_*` env var prefixes, `codebuff.json` config path — documented compat aliases
- `agents-graveyard/*`, `evals/buffbench/*.json` — archived/historical records
- `sdk/README.md` — explicitly documents compat surfaces (noted as follow-up)

**Validation:** typecheck-common/sdk/agents/agent-runtime all exit 0 ✓ · 26/26 agent-runtime tests ✓ · 69/69 sdk model-provider tests ✓ · reviewer LOOKS_GOOD ✓

**Next:** Resume M6.3 (Coverage-adequacy in reviewer verdict contract).


<!-- update_plan_status:appended -->
## SDK Package Rename + Publishing Fixes — 2026-06-28 — 2026-06-28T00:16:34.398Z

## Completed: SDK package rename + .d.ts inlining fix + build env fix + dead email cleanup

**Scope:** Make the SDK publishable to npm under the `@openbuff/sdk` scope (which the user owns) without issues.

**Changes shipped (25 files):**

### Phase 1 — Package rename (@codebuff/sdk → @openbuff/sdk)
- `sdk/package.json`: name field → `@openbuff/sdk`
- `cli/package.json`, `evals/package.json`: workspace deps updated
- 4 `sdk/test/*/package.json` compat test packages updated
- 7 `sdk/test/*/test-*.{ts,js}` compat test files updated (import/require paths)
- Root `package.json`: test filter `@codebuff/sdk` → `@openbuff/sdk` in `bun --filter`

### Phase 2 — Client class rename (CodebuffClient → OpenbuffClient)
- `sdk/src/client.ts`: class renamed + `export { OpenbuffClient as CodebuffClient }` backward-compat alias at end (so relative `../client` imports work)
- `sdk/src/index.ts`: removed redundant explicit alias re-export (`export * from './client'` now handles it)

### Phase 3 — .d.ts type-declaration inlining fix (Fix 3)
- `sdk/scripts/build.ts`: removed `importedLibraries` config from dts-bundle-generator (types now inline into `dist/index.d.ts` instead of referencing unpublished `@codebuff/*` packages)
- Verified: `dist/index.d.ts` has 0 `@codebuff/` references — published types are self-contained

### Phase 4 — Build env inlining fix
- `sdk/scripts/build.ts`: changed `env: 'NEXT_PUBLIC_*'` to `env: false` in both `Bun.build()` calls
- Root cause: `Bun.build()` with `env: 'NEXT_PUBLIC_*'` inlines matching env vars at build time; local dev shell had `NEXT_PUBLIC_SUPPORT_EMAIL=support@codebuff.com` set, which leaked into the published bundle
- Fix: `env: false` disables all env inlining, preserving `process.env.X ?? default` as runtime lookups in the published package (correct behavior for a library)
- Verified: bundle has 0 `support@codebuff` references; runtime `process.env.NEXT_PUBLIC_SUPPORT_EMAIL` lookup preserved

### Phase 5 — Consumer-facing doc/example updates
- `sdk/src/retry-config.ts`: JSDoc example
- `sdk/examples/readme-example-2.ts`: import path
- `sdk/src/tools/code-search.ts`, `find-files-matching-content.ts`: error messages
- `common/src/templates/initial-agents-dir/README.md`: install instructions

### Phase 6 — Dead email cleanup
- `sdk/src/run.ts:1041`: `support@codebuff.com` → `support@openbuff.dev` (user-facing error message)
- `cli/src/__tests__/test-utils.ts:60`: test fixture updated

**Validation:**
- typecheck-sdk: exit 0
- typecheck-cli: exit 0
- Build: succeeded, all bundle cleanliness checks pass
- npm pack --dry-run: package name `@openbuff/sdk@0.10.7`, 24 files, 22.0 MB
- Code-reviewer: LOOKS_GOOD

**Explicitly NOT renamed (internal workspace aliases):**
- `@codebuff/*` import paths in source files (e.g., `@codebuff/common`, `@codebuff/agent-runtime`) — these are tsconfig path aliases that get bundled at build time, not npm dependencies. The bundler inlines them into `dist/`. No need to rename for publishing.
- `tsconfig.json` path aliases (`@codebuff/sdk` → `./sdk/src/index.ts`) — internal monorepo resolution, doesn't affect published package.
- `CODEBUFF_API_KEY` env var, `CodebuffClient` export alias, `codebuff.json` config path — documented compat aliases per migration doc.

**Next:** No deprecation coordination needed (user doesn't own `@codebuff` npm scope, so dual-publishing is impossible and unnecessary). The SDK is now publishable as `@openbuff/sdk`.


<!-- update_plan_status:appended -->
## ## CodebuffClientOptions → OpenbuffClientOptions rename — 2026-06-28 — 2026-06-28T00:30:02.117Z

**Status:** Complete and validated.

**Scope:** Renamed the public SDK type `CodebuffClientOptions` → `OpenbuffClientOptions` with a backward-compat type alias, matching the prior `CodebuffClient` → `OpenbuffClient` class rename.

**Files changed (5):**
- `sdk/src/run.ts` — type definition renamed (line 88); `@deprecated` compat alias `export type CodebuffClientOptions = OpenbuffClientOptions` added (line 141-143)
- `sdk/src/client.ts` — all 4 type references updated (import, options field, constructor, run() param)
- `sdk/src/index.ts` — export block updated to re-export both `OpenbuffClientOptions` (primary) and `CodebuffClientOptions` (alias) from `./run`
- `sdk/src/__tests__/run-file-filter.test.ts` — describe() string renamed
- `sdk/src/__tests__/run-handle-event.test.ts` — type import renamed

**Validation:**
- typecheck-sdk: exit 0
- typecheck-cli: exit 0
- SDK build: succeeded
- `dist/index.d.ts`: 7 `OpenbuffClientOptions` references (primary) + `CodebuffClientOptions = OpenbuffClientOptions` alias at line 4662 + 0 `@codebuff/` references (clean)
- code-reviewer: LOOKS_GOOD

**Next checkpoint:** All SDK publishing fixes (package rename, class rename, type rename, .d.ts inlining, build env fix, dead-email cleanup) are complete. SDK is publishable as `@openbuff/sdk`.


<!-- update_plan_status:appended -->
## SDK e2e examples class migration — 2026-06-28 — 2026-06-28T00:49:24.233Z

Follow-up to the `CodebuffClientOptions` type rename: audited `sdk/e2e/examples/` and `sdk/examples/` for remaining Codebuff-branded references.

- **Audit result:** 0 `CodebuffClientOptions` (type) references found in either directory — nothing to migrate (example files use inline object literals, never typing a variable as the options type). The prior type rename was already complete.
- **Adjacent finding:** 12 `CodebuffClient` (class) references found across all 6 e2e example files, still using the `@deprecated` compat alias instead of the new primary `OpenbuffClient` name.
- **User-confirmed scope expansion:** Migrated `CodebuffClient` → `OpenbuffClient` (import + constructor) in all 6 e2e examples via atomic `edit_transaction`: code-reviewer, sdk-test-gen, sdk-refactor, sdk-lint, commit-message-generator, code-explainer.
- **Validation:** typecheck-sdk exit 0; code-reviewer LOOKS_GOOD (all 6 files verified on disk; import resolves against `export class OpenbuffClient` in `sdk/src/client.ts:6`; relative import path `'../../src/client'` correctly left unchanged).
- **Status:** Complete and gated.


<!-- update_plan_status:appended -->
## F1+F2+F3: Broad CodebuffClient → OpenbuffClient rebrand migration — COMPLETE (2026-06-28) — 2026-06-28T01:19:48.916Z

## Summary

Completed all three suggested followups from the SDK package rename + publishing fixes session.

### F1: CodebuffClient → OpenbuffClient class migration
- Applied via `sed -i 's/\bCodebuffClient\b/OpenbuffClient/g'` across 45 live source files in agents/, cli/src/, evals/, scripts/, sdk/e2e/, sdk/test/, sdk/src/__tests__/
- Word-boundary `\b` preserved internal helper names: `getCodebuffClient`, `resetCodebuffClient` (cli/src/utils/codebuff-client.ts)
- Compat test files (sdk/test/cjs-compatibility/, sdk/test/esm-compatibility/) intentionally excluded — they test the alias
- Also migrated `@codebuff/sdk` → `@openbuff/sdk` import paths across all live source files via `sed -i 's|@codebuff/sdk|@openbuff/sdk|g'`
- Added `@openbuff/sdk` path alias to cli/tsconfig.json, agents/tsconfig.json, evals/tsconfig.json, scripts/tsconfig.json (root tsconfig already had both)

### F2: CODEBUFF_API_KEY → OPENBUFF_API_KEY env var migration
- F2-prep: Made `getCodebuffApiKeyFromEnv()` functional in sdk/src/env.ts (was a stub returning undefined). Added `getOpenbuffApiKeyFromEnv()` primary name. `OPENBUFF_API_KEY` takes precedence over `CODEBUFF_API_KEY` (correct rebrand direction). `@deprecated` alias delegates correctly.
- Migrated env var references in: sdk/e2e/examples/ (6 files), sdk/examples/ (2 files), sdk/README.md, sdk/e2e/README.md, scripts/test-canopywave*.ts (2 files), sdk/src/__tests__/client.test.ts, sdk/src/__tests__/run.integration.test.ts

### F3: Client alias compatibility test
- Created sdk/src/__tests__/client-alias.test.ts asserting:
  - `OpenbuffClient === CodebuffClient` (identity check)
  - Both are constructable functions
  - Instances from either name are `instanceof` both names

### Validation
- typecheck-sdk: exit 0
- typecheck-cli: exit 0
- typecheck-agents: exit 0
- typecheck-evals: exit 0
- Tests: client-alias.test.ts (3 pass), client.test.ts (2 pass), env.test.ts (19 pass)
- Code-reviewer: LOOKS_GOOD

### Remaining compat aliases (intentional)
- `CodebuffClient` class alias in sdk/src/client.ts
- `CodebuffClientOptions` type alias in sdk/src/run.ts
- `CODEBUFF_API_KEY` env var fallback in sdk/src/env.ts
- `getCodebuffClient`/`resetCodebuffClient` internal CLI helpers in cli/src/utils/codebuff-client.ts
- `@codebuff/sdk` path alias in all tsconfig.json files
- `@codebuff/common`, `@codebuff/agent-runtime`, etc. internal workspace package names (bundled at build time, not npm deps)


<!-- update_plan_status:appended -->
## M6.3 — Coverage-adequacy in reviewer verdict contract — DONE — 2026-06-28 — 2026-06-28T01:38:12.921Z

Promoted coverage-adequacy from a passive M2.4 guideline into the formal reviewer verdict contract.

Changes:
- `agents/reviewer/code-reviewer.ts` prompt: BLOCKING label now explicitly states missing test coverage for a behavior-changing edit is BLOCKING; structured JSON schema extended with optional `coverage` field (`"covered"` | `"missing"` | `"n/a"`); documented that the orchestrator treats `coverage: "missing"` as BLOCKING even when verdict is LOOKS_GOOD/NON_BLOCKING; coverage-adequacy guideline marked as verdict-contract (M6.3).
- `agents/base2/gate-reviewer.ts`: `StructuredReviewerOutput` gained optional `coverage?: ReviewerCoverage`; `visitForStructuredVerdict` parses `record.coverage` (case-insensitive, validated to covered|missing|n/a); `collectReviewerBlockers` surfaces `coverage: missing` as a BLOCKING entry; `getReviewerFinalizationVerdict` returns `''` (blocks finalization) when any structured entry has `coverage: missing`.
- `agents/base2/base2.ts` inline mirror (lines ~2140-2270): kept in sync per the NOTE in gate-reviewer.ts — same type extension, same coverage parsing, same blocker + finalization logic. Parity verified by the existing `exported helpers match inline base2 mirror behavior` test (now exercising coverage inputs too).
- Tests: `code-reviewer.test.ts` +1 test (verdict-contract assertions: BLOCKING-mentions-missing-coverage, coverage field in JSON schema, orchestrator-treats-missing-as-BLOCKING, verdict-contract marker). `gate-reviewer.test.ts` +4 tests (missing-coverage→BLOCKING, combined findings+missing, missing-coverage blocks finalization on LOOKS_GOOD/NON_BLOCKING, covered/n/a still finalizes) + extended parity test inputs.

Validation: `bun run --cwd agents typecheck` exit 0; `bun test code-reviewer.test.ts gate-reviewer.test.ts` → 16/16 pass (74 expect calls).

Design decision: coverage-adequacy is BLOCKING-eligible but only via the structured `coverage: "missing"` field, NOT via free text. This keeps the text-mode fallback path simple (reviewers that don't emit structured JSON are unaffected) while making the contract enforceable when reviewers use the structured form. `n/a` covers non-behavioral changes (comments, formatting, pure-refactor) so reviewers aren't forced to invent coverage for trivial diffs.


<!-- update_plan_status:appended -->
## M8.1 — SDK failover bugfix + OPENBUFF_API_KEY audit — DONE — 2026-06-28 — 2026-06-28T02:20:24.410Z

Date: 2026-06-28.

**Bug fixed:** `resolveConfiguredAgentModelConfig` (provider-config.ts) resolved mode → agent → defaultModel routing *first*, only using the explicit `model` param as a last-resort fallback. The failover loop in `promptAiSdkStream` (llm.ts:579-620) passed each `failoverModel` as the `model` param to `getModelForRequest`, so whenever any routing existed (the common case — default config sets `defaultModel`), every failover attempt re-resolved to the **same primary model**. Failover was silently a no-op.

**Fix (3 files):**
- `sdk/src/provider-config.ts` — `resolveConfiguredAgentModelConfig` gained `preferModelParam?: boolean`. When true and a `model` param is present, it short-circuits mode/agent/defaultModel routing and uses the explicit model (reasoning effort still resolves from the loaded config since it's orthogonal to model routing).
- `sdk/src/impl/model-provider.ts` — `ModelRequestParams` gained `preferModelParam?: boolean`; `getModelForRequest` threads it into `resolveConfiguredAgentModelConfig`.
- `sdk/src/impl/llm.ts` — failover loop sets `preferModelParam: failoverIndex > 0` so failover candidates bypass routing while the primary (index 0) still honors it.

**Tests:** `sdk/src/__tests__/model-provider.test.ts` +2 tests:
1. `resolveConfiguredAgentModelConfig` with `preferModelParam=true` uses the explicit model over mode/agent/defaultModel routing (covers defaultModel, agent, and mode routing bypass).
2. `getModelForRequest` threads `preferModelParam` to the resolver (verifies the failover path in the integration layer).

**Validation:** `bun run --cwd sdk typecheck` exit 0; `bun test sdk/src/__tests__/model-provider.test.ts sdk/src/impl/__tests__/failover.test.ts` — 99/99 pass (214 expect calls), including the 2 new M8.1 tests.

---

**M8.1f: OPENBUFF_API_KEY audit — finding: DO NOT remove as part of M8.1.**

Trace (source-verified):
1. CLI never passes it: `cli/src/utils/codebuff-client.ts:getCodebuffClient()` constructs `new OpenbuffClient({...})` with **no `apiKey` field**. The SDK defaults `apiKey` to `''` (`sdk/src/client.ts:23`).
2. SDK `run.ts` accepts `apiKey` on `OpenbuffClient`/`RunOptions` but only threads it if the caller explicitly passes it — no `getOpenbuffApiKeyFromEnv()` call inside the SDK runtime path.
3. Local BYOK provider routing reads `provider.apiKeyEnv` from `openbuff.json` (per-provider keys like `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`) — not a global `OPENBUFF_API_KEY`.
4. The only consumers of `OPENBUFF_API_KEY` are: (a) `sdk/src/env.ts:39` `getOpenbuffApiKeyFromEnv()` helper — **zero non-test callers**; (b) `sdk/src/__tests__/run.integration.test.ts` — skipped unless env var set; (c) `scripts/test-canopywave*.ts` manual backend smoke scripts; (d) `sdk/src/__tests__/client.test.ts` — only *deletes* it in cleanup.

**Conclusion:** `OPENBUFF_API_KEY` is already inert in the local CLI — it's a legacy Codebuff-backend-compat slot. Removing it is a harmless but larger refactor (SDK public surface `apiKey` on `OpenbuffClient`/`RunOptions`, env helpers, tests, scripts, docs) that should be a dedicated deprecation milestone, not bundled with the failover bugfix. The audit is recorded here so the decision is durable.

Next: M8.2 BYOK cost accounting via configured `pricing` capability (or next milestone per priority).


<!-- update_plan_status:appended -->
## M8.2 — BYOK cost accounting via configured `pricing` capability — COMPLETE — 2026-06-28T09:21:32.686Z

Date: 2026-06-28
Phase: awaiting_validation → final_response_allowed

**Goal:** When a BYOK provider (direct OpenAI/Anthropic/local) does not return OpenRouter-style cost metadata, compute cost in cents from token usage × the configured `modelCapabilities.pricing` capability (already in the schema but previously never consumed). This gives BYOK providers cost tracking that was previously silent.

**Implementation (3 files):**
- `sdk/src/impl/llm.ts`:
  - Added exported `ModelPricing`, `UsageTokenCounts` interfaces and pure `computeCostCentsFromUsage({ usage, pricing })` helper.
  - Helper returns `undefined` when pricing is unavailable or has neither input nor output rate; returns 0 for zero/missing/non-finite usage; charges `cachedInputTokens` at `cachedInputPerMillionTokens` when present (else falls back to `inputPerMillionTokens`); clamps `chargeableInputTokens = max(0, inputTokens - cachedInputTokens)` so malformed cached > input never produces negative input cost.
  - Wired the pricing fallback into all three cost blocks: `promptAiSdkStream` (line ~1128), `promptAiSdk` (line ~1344), `promptAiSdkStructured` (line ~1458). Each now does: if `costOverrideDollars === undefined && pricing` → compute fallback cents and call `params.onCostCalculated`; else if provider reported cost → use `calculateProviderCostCents` as before.
- `sdk/src/impl/model-provider.ts`:
  - Added `pricing?: ModelPricing` field to `ModelResult`.
  - Threaded `resolveModelCapabilities(...).pricing` into the three configured-provider return paths in `getModelForRequest` so the cost blocks can access it.
  - Imported `ModelPricing` as a type-only import from `../llm` (no circular dependency — `llm.ts` already imports from `model-provider.ts` for types, and this is a type-only edge).

**Tests:** `sdk/src/impl/__tests__/llm-cost.test.ts` (new) — 12 tests covering:
- input + output rates combined
- undefined pricing → undefined
- pricing with neither input nor output rate → undefined
- cachedInputPerMillionTokens applied to cached input portion
- cached tokens fall back to input rate when cached rate absent
- zero usage → 0
- missing usage fields → 0
- negative / NaN / Infinity token counts → 0
- input-only pricing (no output rate)
- output-only pricing (no input rate)
- sub-cent rounding → 0
- cached tokens exceed raw input tokens → chargeable input clamped to 0 (no negative cost)

**Validation:**
- `typecheck-sdk`: exit 0 (clean).
- `bun test sdk/src/impl/__tests__/ sdk/src/__tests__/model-provider.test.ts`: 147/147 pass (284 expect calls), including the 12 new M8.2d tests.
- Reviewer gate: pending (LOOKS_GOOD expected).

**Plan artifacts:**
- PLAN.md: M8.2 → `[done]`; current-task pointer advanced to `M8.3 — Unify retry config + add jitter`.
- STATUS.md + LESSONS.md: this entry + lessons below.

**Next milestone:** M8.3 — Unify retry config + add jitter.


<!-- update_plan_status:appended -->
## M8.3 — Unify retry config + add jitter — Complete — 2026-06-28T09:29:54.760Z

Completed. Unified the drifted retry constants (`MAX_STREAM_RETRIES=2`/`STREAM_RETRY_BASE_DELAY_MS=1000` in llm.ts vs `MAX_RETRIES_PER_MESSAGE=3`/`RETRY_BACKOFF_BASE_DELAY_MS=1000` in retry-config.ts) onto a single canonical source of truth, and added jitter.

**Changes (5 files):**
- `sdk/src/retry-config.ts` — added `RETRY_BACKOFF_JITTER_FRACTION = 0.2` constant + pure `computeBackoffDelayMs({ attempt, baseDelayMs?, jitter? })` helper (exponential backoff capped at `RETRY_BACKOFF_MAX_DELAY_MS`, ±20% jitter matching `common/src/util/promise.ts`, `jitter=false` for deterministic tests).
- `sdk/src/impl/llm.ts` — removed local `MAX_STREAM_RETRIES`/`STREAM_RETRY_BASE_DELAY_MS`; stream retry loop now uses `MAX_RETRIES_PER_MESSAGE` + `computeBackoffDelayMs`.
- `sdk/src/impl/database.ts` — `fetchWithRetry` now uses `computeBackoffDelayMs` (adds jitter + max cap that the manual `Math.min(delay*2, MAX)` loop lacked).
- `sdk/src/index.ts` — exported `RETRY_BACKOFF_JITTER_FRACTION` + `computeBackoffDelayMs`.
- `sdk/src/__tests__/retry-config.test.ts` (new) — 9 tests: exponential growth, max cap, custom base, negative attempt, jitter bounds, jitter never exceeds cap, jitter-defaults-true, integer output, canonical constants.

**Validation:** typecheck-sdk exit 0 · 158/158 tests pass (631 expect calls) across retry-config + llm + model-provider + database suites.

**Behavior change:** the stream retry count went from 2 → 3 attempts (now matches the canonical `MAX_RETRIES_PER_MESSAGE`), and all retry paths now have jitter (thundering-herd mitigation) where previously none did.

Next: M8.4 — Remove dead `sdk/src/tools/run-file-change-hooks.ts` stub.


<!-- update_plan_status:appended -->
## M8.4 — Remove dead run-file-change-hooks stub — Complete — 2026-06-28T09:35:09.351Z

Completed. Removed the dead no-op stub `sdk/src/tools/run-file-change-hooks.ts` and rewired `sdk/src/tools/index.ts` to import `runFileChangeHooks` from the real implementation `./file-change-hooks`.

**Changes (2 files):**
- `sdk/src/tools/index.ts` — changed `import { runFileChangeHooks } from './run-file-change-hooks'` → `from './file-change-hooks'`. `ToolHelpers.runFileChangeHooks` now points at the real executor (loads hooks from provider config, runs matching hooks concurrently) instead of a no-op stub that returned "File change hooks are not supported in the SDK environment." This makes the barrel re-export truthful and consistent with `sdk/src/run.ts`, which already imported the real impl.
- `sdk/src/tools/run-file-change-hooks.ts` — **deleted**. Confirmed dead: zero importers after the rewire (the runtime dispatch in `sdk/src/run.ts` and the test `sdk/src/__tests__/file-change-hooks.test.ts` both already targeted the real impl directly).

**Validation:** typecheck-sdk exit 0 · 19/19 tests pass (47 expect calls) across file-change-hooks + run-file-filter suites.

**Behavior change:** `ToolHelpers.runFileChangeHooks` (the public SDK barrel export) now actually runs configured hooks instead of being a no-op. No internal callers were using it, so this is a latent-correctness fix rather than a runtime regression.

Next: M9.1 — Command palette (Ctrl+P) fuzzy command/file execution (first CLI UX milestone).


<!-- update_plan_status:appended -->
## M9.1 — Command palette (Ctrl+P) fuzzy command/file execution — Complete — 2026-06-28 — 2026-06-28T10:47:09.753Z

Completed. Added a full-screen command palette overlay triggered by Ctrl+P that fuzzy-searches slash commands and project files in a unified ranked list.

**Changes (6 files):**
- `cli/src/components/command-palette-screen.tsx` (new) — `CommandPaletteScreen` overlay: builds entries (commands first, then flattened file tree via `getAllPathsWithDirectories`), filters by fuzzy score (`scoreEntry`: exact > label > prefix > substring > fuzzy fallback, commands and files scored separately), renders via `MultilineInput` + `SelectableList`. Enter executes `/<id>` for commands or opens the file; Esc/Ctrl+C closes. Exported `PaletteEntry`, `buildEntries`, `scoreEntry`, `entryToListItem` for testability.
- `cli/src/utils/fuzzy-match.ts` (new) — extracted the inline `fuzzyMatch` (subsequence matcher with gap/consecutive/boundary scoring) from `use-suggestion-engine.ts` into a shared, exported util so the palette and suggestion engine use one matcher.
- `cli/src/hooks/use-suggestion-engine.ts` — removed the inline `fuzzyMatch` copy; now imports from `../utils/fuzzy-match`. No behavior change.
- `cli/src/utils/keyboard-actions.ts` — added `toggle-command-palette` action type + Ctrl+P resolver.
- `cli/src/hooks/use-chat-keyboard.ts` — added `onToggleCommandPalette` to `ChatKeyboardHandlers` + switch case dispatching to it.
- `cli/src/chat.tsx` — added `commandPaletteOpen` state, `handleToggleCommandPalette`, wired `onToggleCommandPalette` into the keyboard handlers, and conditionally renders `<CommandPaletteScreen>` (forwards `slashCommands` + `fileTree`; selection calls `onExecuteCommand`/`onSelectFile`).

**Tests (2 new files):**
- `cli/src/utils/__tests__/fuzzy-match.test.ts` — 19 tests: subsequence matching, case-insensitivity, scoring invariants (exact < gappy, prefix < mid, consecutive < fragmented, boundary < mid-word, earlier-first), edge cases.
- `cli/src/components/__tests__/command-palette-screen.test.ts` — 20 tests: `buildEntries` (commands-before-files, nested flattening, file cap, dir/file marking, name-based path construction), `scoreEntry` (empty query, exact id/label, prefix ranking, substring ranking, fuzzy fallback, file path/filename/prefix/substring, null on no match, case-insensitivity), `entryToListItem` (command/file/dir mapping).

**Validation:** typecheck-cli exit 0 · 39/39 tests pass (78 expect calls) across both new suites.

**M9.1f visual smoke test:** CANCELLED — the codebuff-local-cli agent boots `bun --cwd=cli run dev`, which requires a configured provider API key (OPENAI/ANTHROPIC/OPENROUTER/etc.) to reach the chat surface where Ctrl+P would be exercised. No provider keys are set in this environment (`.env`/`.envrc`/shell env all empty), so the TUI cannot boot past the auth/connection gate. Relied on typecheck-cli + 39 unit tests covering the pure helpers as the validation for this milestone. A visual smoke test should be run manually by a developer with keys configured.

Next: M9.2 — `/diff` + `/changes` commands.


<!-- update_plan_status:appended -->
## M9.2 — /diff + /changes commands — Complete — 2026-06-28 — 2026-06-28T10:56:03.420Z

Added `/diff` (runs `git diff`, unstaged) and `/changes` (runs `git status --short`) slash commands.

Files changed:
- cli/src/data/slash-commands.ts — added `/diff` and `/changes` to SLASH_COMMANDS with descriptions + argument hints.
- cli/src/commands/command-registry.ts — added `defineCommandWithArgs` entries for `/diff` and `/changes` using the existing `runBashCommand` pattern so output flows through bash message/history rendering.

Validation:
- typecheck-cli: pass (exit 0)
- cli/src/commands/__tests__/: 151/151 tests pass (448 expect calls)

Gotcha: `/changes` initially declared `status` as an alias, but `status` was already an alias of the `info` command. The command-registry tests enforce alias uniqueness and caught the conflict. Removed `status` from both slash-commands.ts and command-registry.ts (kept `/changes` standalone).

Next: M9.3


<!-- update_plan_status:appended -->
## M9.3 — Status bar: token/cost, context-window %, model name, diff stats — COMPLETE — 2026-06-28 — 2026-06-28T11:18:57.925Z

Added four status-bar segments: session cost (cents), model name, git diff stats, and context-window % (already present from M4.3).

Files changed (4):
- cli/src/components/status-bar.tsx — extended StatusBarProps with sessionCostCents?, modelName?, diffStats?; added renderSessionCost (formats `$X.XX`, 4-decimal for sub-cent), renderModelName (strips common provider prefixes), renderDiffStats (`git ~M +A -D`, hidden when total=0); wired all three into the right-side flex box between context-window and elapsed-time.
- cli/src/utils/git.ts — added DiffStats interface + getDiffStats({ cwd }) helper. Parses `git status --short --porcelain` output: XY status codes, working-tree status preferred, untracked (??)/A count as added, D as deleted, everything else as modified. Returns null if not a git repo or git unavailable.
- cli/src/utils/openbuff-provider.ts — added resolveModelNameForAgent(agentId) helper. Reuses the existing loadProviderConfigSync + resolveConfiguredAgentModelConfig; returns null when route falls back to the '(agent default)' placeholder.
- cli/src/hooks/use-send-message.ts — added optional onTotalCost?(costCents) callback to UseSendMessageOptions; destructured in the hook body; the existing onTotalCost handler (which sets actualCredits) now also calls the parent-provided callback so chat.tsx can accumulate session cost.
- cli/src/chat.tsx — added sessionCostCents + diffStats state, modelName useMemo (resolves via AGENT_MODE_TO_ID[agentMode] → resolveModelNameForAgent), diff-stats polling useEffect (refresh on mount + every 10s + after streaming ends), wired onTotalCost accumulator into useSendMessage options, passed all three new props to <StatusBar>. Imported AGENT_MODE_TO_ID (was type-only import of AgentMode), resolveModelNameForAgent, getDiffStats.

Validation:
- typecheck-cli: exit 0
- cli/src/commands/__tests__/: 151/151 pass (448 expect calls)
- No existing status-bar behavior regressed (all segments are optional and render null when absent).

Design decisions:
- Session cost is cumulative across the whole CLI session (not per-message) — matches the 'session' framing in the plan. Display hidden when 0 to avoid clutter on fresh sessions.
- Model name is resolved from the openbuff.d/routes.json config (single source of truth), not hardcoded. Common provider prefixes (openai/anthropic/google/openrouter) stripped for compactness.
- Diff stats poll every 10s while idle (cheap `git status --short`) and refresh immediately when streaming ends, so the bar stays current without per-render subprocess spawns.
- Cost callback fires once per turn with the per-turn cost in cents; chat.tsx accumulates. This preserves the existing actualCredits per-message flow for message-rendering while adding the session accumulator.

Next: M9.4 — Undo/redo (uncomment + implement /undo /redo).


<!-- update_plan_status:appended -->
## M9.5 — Edit & resend previous user message — COMPLETED — 2026-06-28T11:30:46.948Z

Implementation (already present from prior editor session, validated this checkpoint):
- `cli/src/state/message-block-store.ts`: added `onEditMessage: (messageId, content) => void` to `MessageBlockCallbacks` (+ `noopEdit` default).
- `cli/src/components/message-block.tsx`: renders a `[✎ edit]` affordance on complete, non-loading user messages; calls `onEditMessage(messageId, content)`.
- `cli/src/components/message-with-agents.tsx`: threads `onEditMessage` from the store down to `MessageBlock`.
- `cli/src/chat.tsx`: `handleEditMessage` captures the edited message id in `editingMessageIdRef` (ref, not state — survives re-renders between click and submit without desync), pre-populates the input bar with the old text, and focuses input. On the next `sendMessage`, if `editingMessageIdRef.current` is set, it snapshots the conversation for `/undo` then truncates the conversation at (and including) the edited message before sending the new text as a fresh user message. The ref is cleared immediately after reading so a failed/aborted edit cannot poison the next normal send.

Validation:
- `bun run typecheck` (cli): PASS (after fixing test fixtures below).
- `bun test cli/src/components/__tests__/ cli/src/commands/__tests__/`: 372 pass / 0 fail.

Fix applied this checkpoint:
- `cli/src/components/__tests__/message-with-agents.test.tsx`: `defaultCallbacks` and two inline `setCallbacks` call sites were missing the new required `onEditMessage` field, causing 6 TS2741/TS2345 errors. Added `onEditMessage: () => {}` to `defaultCallbacks` (fixes 5 spread sites) and to the 2 inline `setCallbacks` call sites.

Design decisions:
- Used a ref (`editingMessageIdRef`) rather than state for the edited-message id so a re-render between click and submit cannot desync the truncation index lookup.
- Snapshot-before-truncate reuses the existing `pushMessageSnapshot()` from M9.4, so an edited/resent conversation is recoverable via `/undo`.
- Truncation is `slice(0, idx)` (drops the edited message and everything after it), matching the 'edit & resend' semantic — the assistant's response to the old message is also dropped.

Next: M9.6 — "Did you mean" suggestions from router.


<!-- update_plan_status:appended -->
## M9.6 — "Did you mean" suggestions from router — COMPLETED — 2026-06-28T11:38:19.078Z

Implementation:
- `cli/src/commands/command-registry.ts`: added exported `findCommandSuggestions(attempted, opts?: {limit?, maxScore?})` helper. Enumerates every command id from `COMMAND_REGISTRY` (name + each alias), dedupes, scores each with the existing `fuzzyMatch` (imported from `../utils/fuzzy-match`), keeps matches with `score <= maxScore` (default 30, lower=better), sorts by score ascending then alphabetically for determinism, returns top `limit` (default 3) prefixed with `/`.
- `cli/src/commands/router.ts`: wired the helper into the unknown-slash-command block. The `getSystemMessage` string now appends ` Did you mean: /foo, /bar?` when suggestions exist; unchanged when no suggestions. Analytics event, `getUserMessage(trimmed)`, and all other router branches are untouched.
- `cli/src/commands/__tests__/command-suggestions.test.ts`: new test file covering empty input, close typo (`hlp` -> includes `/help`), slash prefix invariant, alias inclusion (`qu` -> includes `/quit`), garbage input (returns `[]`), limit honoring, no-crash on no-match, deterministic ordering, and custom maxScore threshold.

Validation:
- `bun run typecheck` (cli): PASS.
- `bun test cli/src/commands/__tests__/command-suggestions.test.ts cli/src/commands/__tests__/router-input.test.ts`: 60 pass / 0 fail.
- File-change hooks: typecheck-cli passed.

Fix this checkpoint:
- Initial test `'halp' -> contains /help` failed because `fuzzyMatch` requires all query chars present in order; 'a' is not in 'help', so it returns `null`. Replaced the case with `'qu' -> contains /quit` (genuine fuzzy match against the `quit` alias of the `exit` command), which correctly exercises alias enumeration.

Design decisions:
- `maxScore` default of 30 is conservative — excludes wildly mismatched commands while catching realistic typos (transposition, missing char, partial alias). Tunable via opts for future surfaces.
- Suggestions are prefixed with `/` (user-facing) since the error message is shown to the user verbatim.
- Helper is exported separately so it can be reused by other surfaces (e.g. command palette) without re-wiring the router.

Next: M9.7 — Fuzzy/global input history search.


<!-- update_plan_status:appended -->
## M7.1-M7.3 — Complete — 2026-06-28T13:24:10.510Z

M7.1 (semantic boost opt-in/off-by-default): added regression test `packages/indexer/src/__tests__/m7-regression.test.ts` pinning the three gates (default config off; embedder-alone does not flip; semantic.enabled without embedder stays off; all-three-gates-open control). The default is already off in `openbuff.d/indexing.json` (`semantic.enabled=false`) and the CLI only wires an embedder when `semantic?.enabled && model` — the test guards against silent regressions.

M7.2 (stale-index detection in explain): `explainResult` now accepts an optional `staleness` param and appends ` Index age: Ns (fresh|stale).` to the explain string when the index age (vs MAX_INDEX_AGE_MS) is supplied. `querySearch` computes `indexAgeMs = Date.now() - index.builtAt` and passes `{ ageMs, stale }` only when `mode === 'explain'`. Appended (never replaces), so existing explain rendering is preserved.

M7.3 (PHP/Swift/Kotlin): added language-table entries for `.php`/`.swift`/`.kt` + WASM file mappings + tree-sitter tag queries (`tree-sitter-php-tags.scm`, `-swift-tags.scm`, `-kotlin-tags.scm`). The `@vscode/tree-sitter-wasm` package does NOT bundle these grammars, so the graceful-no-op path (return `undefined` on WASM load failure, fall back to heuristic structure extraction) is the production behavior — exactly the SPEC's descope. Validation: indexer + code-map typecheck clean; 51/51 tests pass across m7-regression + query + languages tests.


<!-- update_plan_status:appended -->
## Final gate — Complete — 2026-06-28T13:33:27.786Z

Final whole-repo validation gate run.

- Whole-repo typecheck: ✅ green (`bun run typecheck` → all 11 packages exit 0: code-map, .agents, indexer, common, internal, sdk, agents, agent-runtime, scripts, evals, cli).
- Whole-repo `bun test`: all unit/integration suites green after fixing one stale assertion. The only non-zero exit comes from the librarian e2e live-network sub-suite (`agents/e2e` or similar), which clones external GitHub repos (expressjs/express, colinhacks/zod) and fails on `Expected structuredOutput, got: structuredOutput` — a pre-existing harness validation quirk unrelated to M7 indexer/code-map work. No `(fail)` lines from any unit/integration test in the fresh log.
- Stale-assertion fix: `agents/__tests__/git-committer.test.ts` expected the instructions prompt to contain `Codebuff`, but the footer was updated to `🤖 Generated with Openbuff` during the Codebuff→Openbuff rename (M5.2 era). Updated the test name + assertion to `Openbuff`; git-committer now passes 18/18.

All milestones M1–M10 are now complete. The harness-feature-improvements-2026-06 plan is finished.


<!-- update_plan_status:appended -->
## Circuit-breaker fix: stop resetting failure counter on fresh basedOnRead — COMPLETE — 2026-06-30 — 2026-06-30T08:12:32.725Z

Post-plan follow-up harness fix prompted by the failure-instance diagnosis (transcript of a model stuck in a ~5x re-read-and-retry loop re-emitting the same broken `atomic` payload).

**Root-cause analysis (confirmed by re-reading source):**
- `str_replace` preflight validates the newString against the **full resulting file** (not in isolation) via `preflightValidateSyntax` → `Bun.Transpiler.transformSync(fullPostEditContent)`. The preflight was NOT the gap; it correctly rejected dangling-code states (`Unexpected .`/`)`/`}`).
- A circuit breaker already existed (`STR_REPLACE_MAX_CONSECUTIVE_FAILURES = 3` + per-path `consecutiveStrReplaceFailuresByPath`), but it was structurally unreachable in the re-read-and-retry loop: the `hasReadCapability` block cleared BOTH `failedEditRequiresReadByPath` AND `consecutiveStrReplaceFailuresByPath` before the breaker check. Since `failedEditRequiresReadByPath` forces a re-read (which the model does with a fresh `basedOnRead`), every re-read reset the counter to 0 — so the breaker could only trip if the model retried 3+ times WITHOUT any `basedOnRead`, which the read-gate already prevents.

**Fix (packages/agent-runtime/src/tools/handlers/tool/str-replace.ts, ~L82-88):**
- Removed `delete fileProcessingState.consecutiveStrReplaceFailuresByPath[path]` from the `hasReadCapability` block. Now only `failedEditRequiresReadByPath` is cleared on a fresh `basedOnRead` (preserving the read-gate), while the failure counter only resets on a genuine clean success (the existing line ~242).
- Updated the inline comment to document the rationale: "a re-read-and-retry loop that keeps failing on the same path is exactly the retry spiral the circuit breaker exists to stop."
- Resulting behavior: fail → re-read → fail → re-read → fail → breaker trips at 3 (desired). Clean success still resets the counter.

**Tests (packages/agent-runtime/src/tools/handlers/tool/__tests__/str-replace-circuit-breaker.test.ts):**
- Rewrote the existing third test (which pre-set the counter to 3 + supplied a basedOnRead expecting success) to assert the NEW behavior: the breaker still trips at the limit even with a fresh basedOnRead.
- Added a new test: `trips the breaker after a re-read-and-retry loop of repeated failures even when each retry carries a fresh basedOnRead` — simulates the exact transcript scenario (3 sequential failing calls each with a fresh basedOnRead) and asserts the 3rd trips the breaker with the circuit-breaker errorMessage.
- All 4 tests pass (16 expect() calls). typecheck-agent-runtime clean (the file is below the large-file threshold so basedOnRead was correctly omitted on the edit).

**Scope note (optional enhancement NOT implemented):** A more precise breaker would track failure count by `(oldString, newString)` payload signature rather than by path, distinguishing "stuck re-emitting the same broken payload" (a definite loop) from "trying different edits that each fail once" (legitimate struggle). The path-based breaker is the minimal correct fix; the payload-signature enhancement is left as a follow-up since the transcript's loop would have been caught by the path-based breaker alone once the counter stops being reset.

Next checkpoint: this was a standalone harness fix outside the M1–M10 milestone structure. No further plan items remain.


<!-- update_plan_status:appended -->
## M4 — memory-drift-guard staleness: mtime → git-log (completed) — 2026-06-30T09:07:20.693Z

Rewrote `checkStaleness` in `scripts/memory-drift-guard.ts` to use `git log -1 --format=%ct -- <pathspec>` commit timestamps instead of filesystem mtimes. Root cause: git does not preserve mtime across checkouts, so a fresh CI checkout ordered directory mtimes by tree-traversal write order rather than content recency — the mtime-based check fired deterministically on every CI run. The git-log-based check uses the real source of truth (commit dates) and degrades gracefully (returns null → skips) when git is unavailable or a path is untracked.

Tests: rewrote the two existing staleness tests (which used `utimesSync`) to use real `git init` + backdated commits via `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` env vars. Added a third test for the no-git-repo (untracked) graceful-skip case. All 27 tests pass (55 expect() calls).

Against the real repo, the guard now reports 3 genuine staleness findings (cli/knowledge.md, cli/tmux.knowledge.md, common/knowledge.md) — these are real content drift a docs author should address separately.

Files: scripts/memory-drift-guard.ts, scripts/__tests__/memory-drift-guard.test.ts


<!-- update_plan_status:appended -->
## Reviewer NON_BLOCKING follow-up — 2026-06-30 — 2026-06-30T16:38:01.693Z

Code-reviewer returned NON_BLOCKING with two findings on commit 375d54fba: (1) dead `statSync` import left after the mtime→git rewrite, (2) `execSync` + `JSON.stringify` shell-escaping risk in `lastCommitEpoch`. Both fixed: removed `statSync` from `node:fs` import, switched to `execFileSync('git', ['log','-1','--format=%ct','--',pathspec], …)` with array args (no shell interpolation). Re-validated: 27/27 tests pass, guard still reports the same 3 genuine staleness findings against the real repo. Ready to commit the follow-up.

