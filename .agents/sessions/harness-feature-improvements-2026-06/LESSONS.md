# LESSONS — Openbuff Whole-Harness Feature Improvements

## What went well
- A 12-way parallel general-agent shard across every subsystem produced grounded, source-cited findings that the single-pass v1/v2 analyses missed entirely.
- Verifying reviewer claims against real source (`FileChangeHook` has no `kind` field; `query.ts` already has IDF; `gitStatus` exists) prevented three wrong implementation directions.

## What was tricky
- The planner (this agent) repeatedly defaulted to low-effort analysis on a broad audit request, hyperfixating on the reviewer's example surfaces and ignoring the orchestrator, runtime, CLI, SDK, edit tools, context, evals, and docs. This is the core meta-finding and drives M10.
- Multiple malformed `spawn_agents` calls (passing objects where strings were expected in `directories`, and passing stringified JSON arrays as agent entries) wasted turns. The `directories` param is `string[]`, not `{path: string}[]`.
- `query_index` is a tool, not an agent — wrapping it in `spawn_agents` fails. Call it directly.

## Key source-verified findings (for the executor)
- `FileChangeHook` schema (`sdk/src/tools/file-change-hooks.ts`): only `name`/`command`/`filePattern`/`timeoutSeconds` — no `kind`. "lint" must be a naming convention, not a schema field.
- `query.ts` already has `computeIdfForTokens`, graph-neighborhood boosting, `references`/`commands`/`explain` modes. Don't "add IDF" — layer semantic as an opt-in boost.
- `gitStatus` (`sdk/src/tools/git-status.ts`) is porcelain-based; `git_branch` should reuse it.
- `resolveConfiguredAgentModelConfig` (`common/src/provider-config.ts`) ignores the `failoverModel` param when agent/defaultModel routing exists → **failover is broken** (M8.1, high-priority bugfix).
- `MAX_STREAM_RETRIES=2` (llm.ts) vs `MAX_RETRIES_PER_MESSAGE=3` (retry-config.ts) — retry config is drifted and has no jitter.
- `sdk/src/tools/run-file-change-hooks.ts` is a dead no-op stub; real impl is `tools/file-change-hooks.ts`. Only lingers in `ToolHelpers`.
- `base-deep.ts` is a bare while loop with NO gate lifecycle, unlike `base2.ts`.
- `loopAgentSteps` computes `contextTokenCount` but never uses it to trigger pruning; pruning is delegated to the model or a crude `getMessagesForModelContext` fallback that drops tool results wholesale.
- `trimMessagesToFitTokenLimit` only summarizes `run_terminal_command` results; all other large tool results are dropped, not summarized.
- `slash-commands.ts` has commented-out `/undo` `/redo`; no undo/redo surface exists.
- Best-of-n, implementation-planner, and several other agents are in `agents-graveyard/` with `tool-reachability.test.ts` guarding against re-enabling them.

## Gotchas for execution
- Adding `MAX_SPAWN_DEPTH` (M2.7) must not break the existing `file-picker → file-lister` and `general-agent → file-picker` chains (depth 2 today).
- M8.1 failover fix changes routing precedence for all agents — add a golden-path test matrix before shipping.
- M3.4 porting `base-deep.ts` to the gate lifecycle risks drift; add a parity test like `gate-repair-parity.test.ts`.
- M7.3: confirm tree-sitter WASM grammar availability for PHP/Swift/Kotlin before committing; graceful no-op is the descope if unavailable.

## Meta-lesson (drives M10)
- The planner defaults to the cheapest path that *looks* like it addressed the request when breadth is unmeasured. A runtime/pattern guard that classifies broad-audit requests and enforces a minimum shard count + coverage matrix + subsystem enumeration is needed so this failure mode can't recur silently.

## Follow-up notes
- Consider adding per-subagent evals (buffbench currently judges whole-task outcomes, not individual subagent quality) — relevant to M2 but out of scope for this session.
- The `context-pruner` agent is auto-spawned by the runtime, not by the orchestrator — M4.1 makes this proactive at the runtime loop level rather than relying on the model or the crude SDK fallback.

<!-- update_plan_status:appended -->
## M1 execution gotchas — 2026-06-27T14:50:46.383Z

Date: 2026-06-27.

- The `update_plan_status` task-matching uses case-insensitive substring match against checklist lines. PLAN.md uses `- [todo] M1.1 ...` markers, and STATUS.md uses prose like `Begin execution with **M1.1**`. Targeted updates only match when the `task` string is a substring of an existing line; otherwise use the `append` path with a clear heading. Prefer `append` for milestone-completion records and `currentTask` for the next-item pointer.
- `toMatchSnapshot()` in bun adds a new snapshot file on first run (`__tests__/__snapshots__/...snap`); the first run reports `+1 added`. Commit the snapshot file so future runs detect drift.
- The shared craftsmanship section was already wired into all three prompts before this resume — likely from a prior compaction boundary. Always verify the wiring (interpolation, not just import) before assuming a milestone sub-step is done.


<!-- update_plan_status:appended -->
## De-hardcoding models — lessons — 2026-06-27 — 2026-06-27T15:59:06.695Z

- The `model` field on `AgentDefinition` was required (`model: ModelName`), but it is only ever a last-resort fallback in `resolveConfiguredAgentModelConfig` (sdk/src/provider-config.ts). In a BYOK CLI with a default routes.json that routes every agent, the hardcoded values silently pinned agents to providers the user may not have. Making it optional was the correct fix; the default routes.json keeps the CLI working out-of-the-box.
- There are TWO copies of `AgentTemplateTypeList`: the canonical one in `common/src/types/session-state.ts` and a local duplicate in `agents/types/secret-agent-definition.ts` (ported, per its own comment). When adding new agent IDs, BOTH must be updated. The agents-package typecheck can pass even when the local copy is stale (definition files use string literals directly), so a stale duplicate is a silent consistency gap. The reviewer caught this as NON_BLOCKING.
- Editor (createCodeEditor) exports 7 variants (opus/gpt-5/glm/kimi/deepseek/minimax + default). The variant mechanism previously set `model:` to a specific provider string per variant; de-hardcoding made all variants return `model: undefined` since routing is owned by routes.json. The test assertions were updated to `toBeUndefined()` for all variants.
- `agents/tmux-cli.ts` was an easy-to-miss outlier — it retained `model: 'minimax/minimax-m2.7'` when all other bundled agents were de-hardcoded. A code-searcher sweep for hardcoded model strings across agents/ is the reliable way to catch stragglers.
- Prior editor-agent attempts to apply this change failed repeatedly due to malformed tool-call arguments (passing stringified JSON where object arrays were expected for `edit_transaction`/`str_replace`/`spawn_agents`). When a subagent reports a tool-call schema error, re-reading the current file state and applying the edit directly with `str_replace` (small files) or `rewrite_symbol` is more reliable than re-delegating.


<!-- update_plan_status:appended -->
## routes.json sync lesson — 2026-06-27 — 2026-06-27T16:23:29.954Z

When de-hardcoding models from agent definitions (making model optional), you MUST also audit openbuff.d/routes.json for two gaps:

1. Stale route keys: variant agents that were collapsed or moved to agents-graveyard/ leave orphaned entries in routes.json agents section + agentReasoningEfforts. These are harmless (unmatched keys are ignored) but contradict cleanup intent.

2. Missing route keys: NEW agents added to agents/ need routes.json entries. This is a FUNCTIONAL bug after de-hardcoding — if model is undefined in the definition AND there's no route, resolveConfiguredAgentModelConfig throws 'No model configured for agent X' at runtime. The default routes.json is the only thing keeping the CLI working out-of-the-box when models are de-hardcoded.

The reliable audit method: run a code-searcher for `id: '...'` across agents/**/*.ts to get the actual registered agent set, then diff against Object.keys(routes.json.agents). The .bak directories (openbuff.d.bak/, openbuff-2.d.bak/) also contain stale variant keys but are backups — do not touch them; only edit the live openbuff.d/ config.


<!-- update_plan_status:appended -->
## M3.4 base-deep gate parity — lessons — 2026-06-27 — 2026-06-27T17:23:20.653Z

- **rewrite_symbol does not add imports.** An `edit_transaction` that was supposed to add the `createBase2` import AND rewrite `createBaseDeep` failed (1 of 2 edits failed due to template-literal escaping in the large oldString). The subsequent `rewrite_symbol` call replaced the function body correctly but left the import missing — the file referenced `createBase2` without importing it. Always verify the import block after `rewrite_symbol`; it locates and replaces a named symbol from the AST but has no mechanism to add new imports. Use `str_replace` or `insert_import` for the import separately.
- **Prefer `rewrite_symbol` over `str_replace`/`edit_transaction` for whole-function replacement.** Copying a large function body into `oldString` is fragile (template-literal backticks, escaped quotes, drift). `rewrite_symbol` locates the symbol by name from the syntax tree, so you don't need the old text at all — only the new body. This eliminated the escaping problem entirely.
- **`edit_transaction` is all-or-nothing per batch.** If ANY edit in the batch fails the preflight, NO files change. When one edit depends on another (e.g., adding an import before using it), this is safe. But when one edit is fragile (large oldString with escaping), it can block a robust edit from applying. Split fragile edits from robust ones, or use `rewrite_symbol` for the fragile part.
- **base-deep composition preserves closures by reference.** `createBaseDeep` calls `createBase2('default', { noAskUser })` and spreads the result, so `baseDeep.handleSteps` is the same function object created inside that `createBase2` call. Unlike the base2 serialization test (`new Function(return (${handleSteps.toString()}))`), base-deep uses the reference directly — closures (gate-state helpers, `runValidationGate`, `reviewerAgentType`, `MAX_REPAIR_ROUNDS`) are preserved without serialization. This is safe because base-deep is a bundled in-process agent, not a serialized subagent.
- **Gate skip allowlist is tiny.** The validation/reviewer gate in base2.ts only skips for `agentId === 'base2-fast'` or `agentId === 'base2-fast-no-validation'` (L334–335). Every other agent ID — including `base-deep`, `base2`, `base2-custom`, `base2-execute-plan` — gets the full gate. So porting base-deep to the gate lifecycle required NO allowlist changes; just composing `createBase2` was sufficient.
- **Parity test pattern.** The most robust parity assertion is behavioral (drive the `handleSteps` generator with the same inputs as base2 and assert the same tool-call sequence), not structural (reference equality of `handleSteps`). Reference equality fails because `createBase2` is a factory — each call returns a new function object. The behavioral sequence test (`git_status` → `spawn_agent_inline` context-pruner → `STEP` → `git_status` → `run_file_change_hooks`) is what actually proves gate parity.


<!-- update_plan_status:appended -->
## Gate-awareness prompt extraction (M3.4 follow-up) — 2026-06-27 — 2026-06-27T17:40:57.887Z

## Context

M3.4 gave base-deep the full gate lifecycle (`handleSteps` + gate tools) via composition with `createBase2`. But base-deep's prompts (systemPrompt, instructionsPrompt) were completely overridden — they didn't inherit base2's gate-awareness guidance ("do not manually spawn code-reviewer for the same edited file set that the automated runtime gate will review"). This caused base-deep's Phase 5 to instruct the model to manually spawn code-reviewer, redundantly alongside the automated gate.

## What went well

- Extracting the gate-awareness bullets into a shared `gateAwarenessSection` (NOT byte-frozen, like `frontendSection`) eliminated duplication and ensured both orchestrators give the model the same guidance.
- Preserving the exact bullet text in the shared section kept all existing `toContain` assertions passing without modification.
- The `quality-prompt-snapshot.test.ts` "all three consumers interpolate" test pattern made it trivial to add wiring assertions for the new section.
- Using `edit_transaction` for the 4-file change (12 replacements) preflighted everything atomically — no partial state.

## Gotcha: prompt-lifecycle vs prompt-content parity

- M3.4's SPEC said "port to the same gate lifecycle" — the lifecycle is the `handleSteps` mechanism (programmatic gate enforcement), which was correctly inherited via composition.
- But gate-awareness *prompts* (telling the model not to manually spawn code-reviewer) are advisory guidance in the system prompt, not programmatic enforcement. base-deep's completely-overridden systemPrompt didn't include them.
- **Lesson:** When composing agents via `createBase2(...)`, fields that are *spread* (like `handleSteps`, `toolNames`, `inputSchema`) are inherited. But fields that are *overridden* (like `systemPrompt`, `instructionsPrompt`, `stepPrompt`) are NOT inherited — any guidance in the parent's prompts must be explicitly re-interpolated via shared sections.

## Pattern: shared prompt sections for composed agents

- When an agent composes another (e.g., `createBaseDeep` composes `createBase2`), extract any parent prompt guidance that the child also needs into a shared section in `quality-prompt-section.ts`.
- Interpolate the shared section in both the parent and child prompts.
- Add a wiring assertion in `quality-prompt-snapshot.test.ts` that both consumers interpolate the section.
- Mark the section as NOT byte-frozen unless the exact wording is load-bearing (only `qualitySection` is byte-frozen).

## Decision: Phase 5 rewrite approach

- base-deep's Phase 5 was rewritten from "manually spawn code-reviewer iteratively" to "defer to the automated gate, optional advisory review only."
- The automated gate (via `handleSteps`) already spawns code-reviewer after validation hooks run. The model doesn't need to manually trigger this.
- The model MAY still spawn code-reviewer for pre-edit/advisory review (e.g., checking a design before implementing), but should not duplicate the gate's post-edit review.


<!-- update_plan_status:appended -->
## Lesson: keep stepPrompt aligned with instructionsPrompt phase rewrites — 2026-06-27 — 2026-06-27T17:44:06.393Z

When rewriting a workflow phase in an agent's `instructionsPrompt` (e.g. changing Phase 5 from manual review loop to automated-gate deferral), ALWAYS check and update the condensed `stepPrompt` reminder too. The `stepPrompt` is shown to the model at every turn and contains a one-line-per-phase summary; if it still describes the OLD behavior, it directly undermines the rewrite (the model follows the per-turn reminder and spawns the redundant reviewer anyway).

In this case, extracting base2's gate-awareness bullets into a shared `gateAwarenessSection` and rewriting base-deep's Phase 5 to defer to the automated gate was incomplete until the `stepPrompt` line `5. Review Loop — code-reviewer → fix → re-review until clean` was also updated to `5. Review — defer to automated gate (validation + code-reviewer); fix any BLOCKING findings`.

Pattern: any multi-field prompt change (systemPrompt + instructionsPrompt + stepPrompt) requires scanning ALL three fields for stale references to the old behavior, not just the field being rewritten. The reviewer caught this as a non-blocking observation; treat such observations as required follow-ups when they directly undermine the user's stated goal.


<!-- update_plan_status:appended -->
## Structural invariant: stepPrompt drift can only occur in base2-composing agents with stepPrompt overrides — 2026-06-27 — 2026-06-27T17:46:47.267Z

The stepPrompt/instructionsPrompt drift pattern (per-turn reminder contradicting the automated gate) is structurally limited to agents that BOTH compose `createBase2` AND override `stepPrompt`. In the current codebase, only `base-deep` satisfies both conditions — it composes `createBase2('default', { noAskUser })` and sets its own `stepPrompt` with phase reminders.

Leaf agents (debugger, doc-writer, security-reviewer, test-writer) cannot drift because:
- They don't compose `createBase2` — no gate lifecycle to contradict
- They don't set `stepPrompt` — no per-turn reminder to drift
- They have `spawnableAgents: []` — can't instruct manual code-reviewer spawning

Thin base2 wrappers (base2-fast, base2-plan, base2-execute-plan, base2-evals, base2-fast-no-validation) cannot drift because:
- They spread `createBase2(...)` and only override `id` — they inherit ALL prompts from base2, so stepPrompt and instructionsPrompt stay in sync by construction

When auditing for this drift pattern in the future, the search is: `grep -n 'stepPrompt' agents/` intersected with `grep -n 'createBase2' agents/` — only files in both result sets are drift candidates.


<!-- update_plan_status:appended -->
## M4.1 runtime auto-pruning — lessons — 2026-06-27 — 2026-06-27T18:12:55.660Z

## Design decision: deterministic trim vs LLM-based pruning

- M4.1 could have been implemented by auto-spawning the `context-pruner` *agent* from `loopAgentSteps` (the LLM-based path). Instead, the chosen design uses a deterministic `maybePruneContext` helper that delegates to `trimMessagesToFitTokenLimit`.
- **Rationale:** Spawning the context-pruner agent from inside `loopAgentSteps` would create a circular dependency — `executeSubagent` (spawn-agent-utils.ts) imports `loopAgentSteps`, so `loopAgentSteps` cannot import `executeSubagent` without a cycle. The deterministic helper avoids this entirely: it imports only `trimMessagesToFitTokenLimit` + types.
- **Layering:** The runtime-level `maybePruneContext` is a proactive safety net for ALL agents. Orchestrators' `handleSteps` (base2, general-agent) still spawn the LLM-based `context-pruner` agent for smarter summarization when they detect the conversation growing. The two layers are complementary: runtime trim is fast and deterministic (drops/summarizes tool results); the LLM pruner is smart (semantic summarization of conversation history).

## Implementation gotchas

- `messagesWithStepPrompt` was declared `const` and used only for token counting. Changing it to `let` was required so the pruning block could rebuild it from the pruned history. Always check if a variable is `const` before reassigning — TypeScript catches this but the semantic intent (immutable) should be preserved in the naming.
- After pruning, `contextTokenCount` must be recomputed from the pruned `messagesWithStepPrompt` (not the original). The `estimateContextTokensLocally()` closure captures `messagesWithStepPrompt` by reference, so reassigning `messagesWithStepPrompt` before calling it again gives the correct post-prune token count.
- `maxContextLength` was already an optional param on `loopAgentSteps` (pre-existing, L799) but was previously unused for pruning — it was only surfaced in `agentState` for status display. M4.1 now actually consumes it as the pruning threshold, closing the gap between "tracked but unused" and "tracked and acted upon."

## Test pattern

- Mock `countTokensJson` to count JSON-stringified characters (simple, deterministic) — same pattern as `messages.test.ts`. This makes the test independent of the real tokenizer while still exercising the threshold comparison logic.
- The under-threshold test asserts `result.messages === messages` (same reference, no copy) — this guards against unnecessary array allocation on the no-op path.
- The over-threshold test asserts `result.messages !== messages` (new array) AND that the final token count is less than the input — this proves actual trimming occurred, not just a flag flip.


<!-- update_plan_status:appended -->
## M4.2 — lessons — 2026-06-27 — 2026-06-27T19:25:57.204Z

## Pipeline exit codes can mask tsc failures

The typecheck command `bun run typecheck 2>&1 | tail -20` returns exit code 0 from `tail` (the last command in the pipeline), NOT from `tsc`. Always inspect the captured stdout for `error TS####` lines — a 0 exit code from a piped typecheck does NOT mean typecheck passed. To get the real tsc exit code, either run `bun run typecheck` without piping, or check `${PIPESTATUS[0]}` in bash.

## Untyped test fixtures for "unknown tool" dispatcher paths

When a test deliberately uses arbitrary content that doesn't match any specific tool's output schema (e.g. testing the "unknown tool name" fallback path of `simplifyToolResultContent`), the content literal won't satisfy `CodebuffToolOutput` (a discriminated union over all tool types). Cast via `as unknown as CodebuffToolOutput` — the same pattern used for "error" test fixtures with deliberately malformed content. Don't leave the content untyped; tsc will flag both the declaration AND the `toEqual(content)` call.

## Compaction-boundary state drift between PLAN.md and STATUS.md

M4.2 was fully implemented (source + tests + schemas) and PLAN.md's checklist was marked `[done]`, but STATUS.md had no completion record and the current-task pointer still pointed to M4.2. This is a compaction-boundary artifact: the implementation and PLAN checklist update happened, but the STATUS.md append and currentTask pointer advancement didn't. On resume, always cross-check four signals: (1) PLAN.md checklist marker, (2) STATUS.md last completion record, (3) current-task pointer, (4) actual git diff. If they disagree, the actual code (git diff + read_files) is the source of truth — verify it with validation before recording completion. In this case, the code was implemented but had 2 type errors that the prior boundary skipped validating; the premature `[done]` marker was caught by re-running typecheck.

## M4.2 design: idempotent summarizers + dispatcher

Each per-tool summarizer (`simplifyCodeSearchResults`, `simplifyReadSubtreeResults`, etc.) is idempotent: it checks for an `*OmittedForLength` sentinel field and returns the input unchanged if already simplified. This is critical because `trimMessagesToFitTokenLimit` calls the dispatcher in TWO passes — a first pass that summarizes older results (keeping the N most recent verbatim via `numToolResultsToKeep`), and a second O(n) optimization pass that re-summarizes remaining results to squeeze under the token limit. Idempotency ensures the second pass is a no-op on already-simplified content rather than double-truncating. The dispatcher (`simplifyToolResultContent`) also has a try/catch that returns the original content on error, so a malformed result never crashes the trim loop.


<!-- update_plan_status:appended -->
## M4.2 Integration-Test Follow-up — Lessons (2026-06-27) — 2026-06-27T20:06:36.544Z

- **Excerpt fields differ across summarizers:** `code_search` and `web_search` summarizers produce `stdoutExcerpt`/`resultExcerpt` fields (up to 2000 chars via `getOutputExcerpt`), while `read_subtree` and `query_index` summarizers fully omit large fields (`printedTreeOmittedForLength`, `matchedSnippetsOmittedForLength`) without excerpts. When writing integration tests for summarizable tools, account for excerpt fields: set `maxTotalTokens` high enough to accommodate excerpts, and don't assert payload substrings are absent (excerpts contain them).
- **Mock token counter returns raw char count:** The `countTokensJson` mock in `messages.test.ts` returns `JSON.stringify(text).length` (not divided by 4). A 2000-char excerpt = ~2000 "tokens". Tests using `maxTotalTokens: 1500` will fail if the summarized result includes a 2000-char excerpt. Always check the mock ratio before setting token limits in tests.
- **Atomic str_replace batches abort entirely on ambiguity:** If ANY single replacement in an atomic batch matches multiple occurrences, NO changes are made. Always include enough surrounding context (e.g., the `toMatchObject` block above, or a unique type guard like `CodebuffToolMessage<'code_search'>`) to make each `oldString` uniquely identifiable. The same assertion string (`not.toContain('export function authenticate')`) appeared in both the code_search test (line 542) and the query_index test (line 668) because the query_index test's `matchedSnippets` payload also contained that string.
- **Structural + token-count assertions are sufficient for summarizer integration tests:** The `not.toContain(payload)` assertions were originally intended to verify large payloads were removed, but they're redundant with structural assertions (which prove the summarizer ran) and token-count assertions (which prove the result fits). A summarizer that set `*OmittedForLength: true` but kept the full payload would fail the token-count check.


<!-- update_plan_status:appended -->
## M4.3 — Context-window status bar — lessons — 2026-06-27 — 2026-06-27T20:40:06.347Z

1. TypeScript closure-narrowing gotcha: `let x: T | null = null` assigned inside a closure (e.g. a mock callback) is narrowed to `null` at the subsequent `expect(x)` call site because TS control-flow analysis doesn't track that the closure runs before the assert. Fix: use a wrapper object `const captured = { value: null as T | null }` and assign `captured.value = ...` inside the closure — property accesses on mutable objects can't be narrowed.

2. Cross-package PrintModeEvent wiring pattern (3-package change): Adding a new event type to the `printModeEventSchema` discriminated union in `common/src/types/print-mode.ts` requires coordinated changes in 3 packages: (a) common: add schema + type export + add to discriminatedUnion array, (b) agent-runtime: emit via `onResponseChunk({ type: '...', ... })` from `loopAgentSteps` or `runAgentStep`, (c) cli: add `.with({ type: '...' })` branch to `createEventHandler` in `sdk-event-handlers.ts`, add callback type to `StreamingState`, wire through `create-event-handler-state.ts` → `use-send-message.ts` options → component state → UI prop.

3. Test mock must match StreamingState: When adding a new field to `StreamingState` (e.g. `setContextWindowUsage`), the mock `EventHandlerState` in `sdk-event-handlers.test.ts` must be updated to include it, or typecheck-cli fails with TS2741 'Property X is missing in type'.

4. Pipeline exit code masks tsc failure (recurring): `bun run typecheck 2>&1 | tail -N` returns exit 0 from `tail`, not from `tsc`. Always check the stdout for `error TS...` lines, not just the exit code.

5. StatusBar color-coding: `theme.warning` is the right color for context-window pressure (>=70%), `theme.secondary` for normal. Matches the existing retrying/connecting patterns.


<!-- update_plan_status:appended -->
## M5.1 — Git discipline constant extraction — 2026-06-27T20:55:43.862Z

- **sed extraction for byte-identical moves**: When extracting a template literal with complex escaping (backticks, `${}`, backslashes), use `sed -n 'START,ENDp' source > target` + `sed -i 'START,ENDd' source` rather than manual transcription via `write_file`. This guarantees byte-identical content and avoids JSON-escaping pitfalls when the content contains backslashes and backticks.
- **Path math for cross-directory imports**: From `common/src/tools/params/tool/run-terminal-command.ts`, the path to `common/src/constants/git-discipline.ts` is `'../../../constants/git-discipline'` (up 3 levels from `tool/` → `params/` → `tools/` → `src/`, then into `constants/`). The existing `'../../constants'` import resolves to `common/src/tools/constants.ts` (a different file in the tools subdir), NOT `common/src/constants/`. Always verify path math against the actual directory structure.
- **Files created via bash not detected by hooks**: Files created via `sed`/`bash` (not `write_file`) may not trigger file-change hooks. Run typecheck explicitly (`bun run --cwd <pkg> typecheck`) to verify new files are valid.
- **update_plan_status checkbox format**: The `update_plan_status` tool expects `- [ ]`/`- [x]` checkbox format, but this PLAN.md uses `- [todo]`/`- [done]`. Use `str_replace` directly to flip `[todo]` → `[done]`.


<!-- update_plan_status:appended -->
## M5.2 — git-committer resurrection — 2026-06-27 — 2026-06-27T21:04:19.344Z

**Bundled agent registration requires 3 touch points:** When adding a new bundled agent, you must update all three:
1. `common/src/types/session-state.ts` `AgentTemplateTypeList` — add the underscore form (e.g. `'git_committer'`). This is the canonical source; `AgentTemplateTypes` maps it to the dash form.
2. `agents/types/secret-agent-definition.ts` `AgentTemplateTypeList` — duplicate list that must be kept in sync (the agents package has its own copy).
3. `common/src/constants/agents.ts` `AGENT_PERSONAS` — add the dash-form key (e.g. `'git-committer'`) with displayName + purpose. The `satisfies Partial<Record<AgentTemplateTypes[...], ...>>` constraint means the key must be a valid template type value, so step 1 is a prerequisite.

**Auto-discovery via prebuild:** The `cli/scripts/prebuild-agents.ts` script auto-discovers agent files in `agents/` by scanning the directory — no manual registration in the prebuild script is needed. Just create `agents/<name>/<name>.ts` with `export default definition`.

**SecretAgentDefinition vs AgentDefinition:** Modern bundled agents use `SecretAgentDefinition` (from `agents/types/secret-agent-definition.ts`), which extends `AgentDefinition` with `AllToolNames` (includes internal tools like `add_subgoal`, `create_plan`, etc.). The graveyard agents used the base `AgentDefinition`.

**Vestigial model field:** Bundled agents should NOT specify a `model` field — routing is controlled exclusively by `openbuff.d/routes.json`. The test pattern asserts `expect(def.model).toBeUndefined()`. Including a model field will cause the test to fail.

**handleSteps sandbox safety:** The `handleSteps` generator is serialized to a string by the prebuild script and re-evaluated via `new Function()`. It must NOT close over top-level lexical bindings. Only reference function arguments (e.g. `{ params }` from `AgentStepContext`). The test `expect(() => new Function('return (' + src + ')')()).not.toThrow()` enforces this.

**Tool call type narrowing:** Use `as ToolCall<'toolName'>` for each yielded tool call in handleSteps. This provides type-safe input validation. Import `ToolCall` from `'../types/agent-definition'`.

**Codebuff footer convention:** Commits created by AI agents should include the footer: `🤖 Generated with [Codebuff](https://codebuff.com)` as a separate `-m` argument to `git commit`.


<!-- update_plan_status:appended -->
## M5.3 — git_branch SDK helper — 2026-06-27T21:30:08.080Z

Gotcha: `gitStatus` parses `git status --short --branch` output and applies `.trim()` to the full status body, which strips leading whitespace from the first status line. A dirty-tree line like ` M file.ts` (leading space = unstaged column) becomes `M file.ts` in the returned `status` field. Test assertions on status content must not expect the leading space.

Pattern: For testing SDK helpers that make multiple sequential `spawn` calls (like `gitBranch` which calls `gitStatus` → `runGit` then `runGit` again), use `queueMicrotask` inside the mock `spawn` to auto-emit stdout/stderr/close events after `runGit` synchronously attaches its listeners. This avoids fragile `await Promise.resolve()` flushes between calls.

Decision: `gitBranch` is an SDK-only helper (not registered as an agent-runtime tool), matching `gitStatus`'s visibility. If agent-runtime tool registration is needed later, it would require adding `git_branch` to the `ToolName` union, creating params in `common/src/tools/params/tool/`, and a handler in `packages/agent-runtime/src/tools/handlers/tool/`.

Reusable: `runGit` is now exported from `sdk/src/tools/git-status.ts` for any future git-related SDK helper that needs to spawn `git` with stdout/stderr/exitCode capture.


<!-- update_plan_status:appended -->
## M5.4 — git_discipline prompt section lessons (2026-06-28) — 2026-06-27T21:43:41.675Z

- **Orchestrator-only vs. all-consumer sections:** `gitDisciplineSection` is orchestrator-level guidance (when to commit, staging discipline, no-push/no-force guardrails). It was interpolated into `base2.ts` and `base-deep.ts` only — NOT the editor, since the editor implements code changes but doesn't decide commit timing. The snapshot test's "all consumers" assertion must be scoped per-section to avoid false failures on orchestrator-only sections.
- **Byte-frozen vs. evolving:** `qualitySection` is byte-frozen (snapshot-locked). `frontendSection` and `gitDisciplineSection` are intentionally NOT byte-frozen — only content-coverage assertions (required headings/topics) guard them, so they can evolve without snapshot churn.
- **Layered git guidance:** The `gitCommitGuidePrompt` constant extracted in M5.1 lives in the `run_terminal_command` tool description (tool-level: how to write commit messages). The new `gitDisciplineSection` is the orchestrator-level complement (when to commit, staging, no-push guardrails). Together they cover both the "how" and "when" of git operations.
- **edit_transaction atomicity:** All 4 edits (section export + 2 orchestrator interpolations + test extension) applied atomically via a single `edit_transaction`, preventing partial-state drift if any one edit had failed.


<!-- update_plan_status:appended -->
## M6.1 — Hook naming convention decision — 2026-06-27T22:02:27.884Z

The `FileChangeHook` type (`sdk/src/tools/file-change-hooks.ts`) has only `name`/`command`/`filePattern`/`timeoutSeconds` — no `kind`/`category` field. Adding a schema field would require migrating all existing `hooks.json` configs and provider-config merge logic. A naming prefix convention (`typecheck-*`, `lint-*`, `test-*`, `build-*`) is zero-cost, backward-compatible, and sufficient for the orchestrator to infer the failure category from the `hookName` string in gate-state boxes and repair guidance. Documented this as a convention in `docs/configuration.md` rather than adding schema enforcement.


<!-- update_plan_status:appended -->
## M6.2 — Pre-edit advisory security review (2026-06-28) — 2026-06-27T22:33:21.254Z

Decision: advisory prompt section, not programmatic interception.

The handleSteps generator is serialized via .toString() + new Function(), so any programmatic auto-spawn of security-reviewer before the editor would require inlining all logic as a string — fragile and high-risk (LESSONS are full of handleSteps serialization gotchas). The SPEC says 'advisory' (non-blocking), and R6.1 established the soft, documentation-level enforcement pattern.

Chosen approach (matches M5.4/M6.1 patterns):
- Added securityReviewSection to agents/base2/quality-prompt-section.ts — advisory guidance listing security-sensitive file patterns (auth, crypto, payment, secrets, permissions) + when to spawn security-reviewer pre-edit.
- Interpolated into both orchestrators (base2 + base-deep), NOT the editor — the orchestrator decides when to review; the editor implements the (already-reviewed) change.
- Extended quality-prompt-snapshot.test.ts with content coverage test + wiring assertions (editor exclusion documented).

The security-reviewer agent already exists with read-only tools (read_files, read_outline, code_search, git_status) — it cannot modify files, making it safe for advisory pre-edit review.

Gotcha: The editor agent already imports qualitySection + frontendSection but NOT gateAwarenessSection/gitDisciplineSection/securityReviewSection — this is intentional. The editor is a focused code-editing tool; orchestrator-level guidance (git discipline, security review) belongs only in the orchestrator prompts. The snapshot test documents this exclusion with explicit comments.


<!-- update_plan_status:appended -->
## Branding Cleanup Lessons — 2026-06-28 — 2026-06-27T23:16:33.534Z

User-requested detour: remove legacy codebuff branding + Co-Authored-By footers.

**Key decisions:**
- `@codebuff/*` package namespace is explicitly out of scope — `docs/codebuff-to-openbuff-migration.md` says it requires a coordinated dual-publishing deprecation period. The ~200 `@codebuff/` imports across the codebase are documented compatibility aliases.
- `CODEBUFF_*` env var prefixes, `CodebuffClient` export, and `codebuff.json` config path are also documented compat aliases — only VALUES (dead URLs/emails) were changed, not the NAMES.
- The publisher namespace rename (`codebuff/` → `openbuff/` agent IDs) IS in scope — the docstring in `agent-definition.ts` already called it the "legacy 'codebuff' publisher namespace," and it's a contained change (one constant + consumers auto-propagate).

**Gotcha — test files are self-contained:**
- `getMatchingSpawn` in `spawn-agent-utils.ts` does pattern/substring matching, NOT `DEFAULT_ORG_PREFIX`-based normalization. So tests using `codebuff/file-picker@1.0.0` as test data won't break when `DEFAULT_ORG_PREFIX` changes — they're testing string matching, not publisher resolution.
- `tryTransformAgentToolCall` in `prompts-schema-handling.test.ts` just passes through the agent_type string — also self-contained.
- `model-provider.test.ts` uses `codebuff/agent-builder@1.2.3` as a config key + lookup agentId — both must match, so rebranding both keeps the test consistent.
- Still worth rebranding test data for brand consistency, even though tests pass either way.

**Gotcha — `.dev` vs `.test` email TLD distinction:**
- Original code had `support@codebuff.com` (real domain) in `sdk/test/setup-env.ts` but `support@codebuff.test` (test TLD) in evals/common fixtures.
- Rebrand correctly preserves this distinction: `support@openbuff.dev` for setup-env, `support@openbuff.test` for eval/common fixtures. The `.test` TLD is a reserved TLD for testing.

**Reusable pattern — env var value-only rebrand:**
- When rebranding dead URLs/emails in env var values, preserve the env var NAME (e.g., `NEXT_PUBLIC_CODEBUFF_APP_URL`) since it's a compat alias. Only change the value.

**Follow-up consideration:**
- `sdk/README.md` still references `codebuff/base@0.0.16` (hosted agent examples). Since the user said "We don't have any access to codebuff resources besides the opensourced source code," these hosted agent examples are misleading. A future pass could update the README to use local-agent examples instead of hosted ones. Left as follow-up since the README explicitly documents compat surfaces.


<!-- update_plan_status:appended -->
## SDK Package Rename + Publishing Fixes — Lessons — 2026-06-28T00:16:50.639Z

## Key lessons

### 1. Bun.build() `env` option inlines env vars at build time
- `env: 'NEXT_PUBLIC_*'` tells Bun's bundler to inline matching env vars as string literals in the output.
- When the env var IS set in the OS environment, `process.env.X` is replaced with the literal value (e.g., `"support@codebuff.com"`).
- When the env var is NOT set, `process.env.X` is preserved as a runtime lookup.
- **For published libraries:** Use `env: false` to disable all inlining. Published packages should read env vars at runtime, not bake in build-time values. This prevents local dev config from leaking into the npm package.

### 2. Modifying `process.env` in a build script does NOT affect `Bun.build()`
- Deleting `process.env.NEXT_PUBLIC_SUPPORT_EMAIL` in the build script did NOT prevent the bundler from inlining it.
- `Bun.build()` appears to read from the OS environment directly, not from the JS-level `process.env` object.
- The only reliable way to prevent inlining is the `env` option on `Bun.build()` itself (`env: false`).
- Verified empirically: `env -u NEXT_PUBLIC_SUPPORT_EMAIL bun run build` → clean bundle; `process.env` deletion in script → still dirty.

### 3. Backward-compat alias must be in the source file, not just the package entry point
- Adding `export { OpenbuffClient as CodebuffClient }` in `index.ts` (package entry) is insufficient.
- SDK test files import via relative paths (`import { CodebuffClient } from '../client'`), bypassing the package entry.
- The alias must be in `client.ts` itself so BOTH relative and package-level imports resolve.
- Once the alias is in `client.ts`, `export * from './client'` in `index.ts` handles it — no need for an explicit re-export line (which would cause a duplicate export conflict).

### 4. dts-bundle-generator `importedLibraries` config controls type inlining
- By default, `dts-bundle-generator` treats packages in `importedLibraries` as EXTERNAL type references (the `.d.ts` will have `import { X } from '@codebuff/common'`).
- Removing `importedLibraries` makes the generator INLINE types from workspace packages into the output `.d.ts`.
- For publishing: the `.d.ts` must be self-contained (no references to unpublished `@codebuff/*` packages). Removing `importedLibraries` + having tsconfig path aliases that resolve the packages achieves this.
- Verified: `dist/index.d.ts` has 0 `@codebuff/` references after the fix.

### 5. No deprecation coordination needed for fork publishing
- The migration doc's "dual-publishing deprecation period" advice (publishing both `@codebuff/sdk` and `@openbuff/sdk`) only applies to the OWNER of the `@codebuff` npm scope.
- For a fork where you don't own the upstream scope: just publish under your own scope (`@openbuff/sdk`). npm rejects publishes to scopes you don't own. There's no installed base to break. The upstream `@codebuff/sdk` continues to exist independently on npm.

### 6. Internal `@codebuff/*` imports don't need renaming for publishing
- The SDK source files use `@codebuff/common`, `@codebuff/agent-runtime`, etc. as tsconfig path aliases.
- `sdk/scripts/build.ts` filters `@codebuff/*` OUT of the bundler's `external` list, so they get BUNDLED INTO `dist/index.mjs`/`dist/index.cjs` at build time.
- Runtime consumers never install `@codebuff/*`. The published bundle is self-contained.
- These imports can stay as `@codebuff/*` indefinitely — they're build-time aliases, not npm dependencies.

### 7. Root `package.json` test filter must match workspace package names
- `bun --filter='{@codebuff/common,...,@codebuff/sdk,...}' run test` filters by package `name` field.
- When renaming `sdk/package.json` name to `@openbuff/sdk`, the test filter MUST also use `@openbuff/sdk` (otherwise `bun run test` skips the SDK).
- Only the renamed package's entry changes; other `@codebuff/*` packages keep their entries.

## Build verification checklist for npm publishing
1. `bun run build` succeeds with no errors
2. `grep -c '@codebuff/' dist/index.d.ts` → 0 (types self-contained)
3. `grep -c 'support@codebuff' dist/index.mjs dist/index.cjs dist/index.d.ts` → 0 (no legacy branding)
4. `grep -c '@codebuff/sdk' dist/index.mjs dist/index.cjs` → 0 (no stale import specifiers)
5. `grep 'process.env.NEXT_PUBLIC_' dist/index.mjs` → matches found (runtime env lookup preserved)
6. `npm pack --dry-run` → shows correct package name (`@openbuff/sdk@version`) and file list
7. `CodebuffClient` alias present in `dist/index.d.ts` (backward compat for existing consumers)


<!-- update_plan_status:appended -->
## ## Type rename pattern: CodebuffClientOptions → OpenbuffClientOptions — 2026-06-28 — 2026-06-28T00:30:11.180Z

**Pattern for renaming a public SDK type without breaking consumers:**

1. Rename the type definition in its source file (e.g., `export type OpenbuffClientOptions = {...}`).
2. Add a `@deprecated` backward-compat alias immediately after: `/** @deprecated Use OpenbuffClientOptions instead. */ export type CodebuffClientOptions = OpenbuffClientOptions`.
3. Update the package entry point (`index.ts`) to re-export BOTH the new primary name and the old alias from the source module.
4. Update all internal usage sites (client class fields, constructor params, method params) to the new name.
5. Update test files: rename `describe()` strings and `import type` statements. Leave class-name compat aliases (`CodebuffClient`) in test imports/describes untouched — they are a separate compat surface.

**Verification gate for published types:**
- After editing, rebuild the SDK and grep the generated `dist/index.d.ts` for both the new primary name and the alias. The alias should appear as `export type CodebuffClientOptions = OpenbuffClientOptions;`.
- Confirm 0 `@codebuff/` references remain in the `.d.ts` (the inlining fix from the prior pass holds).

**Gotcha:** The `CodebuffClient` class alias lives in `client.ts` (not `index.ts`) so relative `../client` imports resolve. The TYPE alias, by contrast, lives in `run.ts` (the definition source) and is re-exported via `index.ts`. Both patterns work because the alias is co-located with the definition it aliases.

**Consumer impact:** Zero breaking changes — any existing code importing `CodebuffClientOptions` continues to resolve via the alias. IDEs will show a `@deprecated` strikethrough guiding migration to `OpenbuffClientOptions`.


<!-- update_plan_status:appended -->
## Lesson: audit-then-migrate flow for compat aliases — 2026-06-28 — 2026-06-28T00:49:30.041Z

When migrating a renamed symbol (class/type) across example dirs, the audit step matters: the user asked specifically about `CodebuffClientOptions` (the type), but a grep for the broader `CodebuffClient` prefix surfaced 12 class-alias references the user hadn't asked about. Surfacing the adjacent finding + asking via `ask_user` before expanding scope avoided an unrequested edit while still delivering the useful migration.

Reusable pattern: `grep -rn 'OldName|NewName' <dir>` on example directories before editing — example files often instantiate classes inline with object literals and never explicitly type variables, so type-only renames frequently have zero hits even when class renames have many. Don't assume a type rename implies example-file edits.

Gotcha: `run_file_change_hooks` reported `hooks_skipped` for the 6 e2e `.ts` example files (none matched the configured hook file patterns), but the SDK typecheck (`tsc --noEmit -p .` in `sdk/`) covers them via `sdk/tsconfig.json` includes, so the prior pinned `typecheck-sdk passed` result is the authoritative validation signal. The code-reviewer gate (LOOKS_GOOD) closed the reviewer side.

The `edit_transaction` with 12 identical `str_replace` operations across 6 files (2 per file, same oldString/newString) applied cleanly in one atomic batch — good pattern for mechanical find-replace across many small files with identical edit shape.


<!-- update_plan_status:appended -->
## F1+F2+F3: Broad rebrand migration lessons (2026-06-28) — 2026-06-28T01:20:06.175Z

## Key lessons

### 1. Word-boundary sed is safe for class-name renames
- `sed -i 's/\bCodebuffClient\b/OpenbuffClient/g'` correctly preserves `getCodebuffClient`/`resetCodebuffClient` because `\b` does not match between two word characters (the `t` in `get` and `C` in `CodebuffClient` are both word chars, so no word boundary exists)
- This is the safest approach for a mechanical class-name rename across 45+ files — far more reliable than manual str_replace for each file
- Always do a dry-run first (`sed -n 's/.../gp'` to print matches without editing) to verify the word-boundary behavior

### 2. Per-package tsconfig.json path aliases need manual sync
- The root tsconfig.json had both `@codebuff/sdk` and `@openbuff/sdk` path aliases, but cli/tsconfig.json, agents/tsconfig.json, evals/tsconfig.json, scripts/tsconfig.json each had their own `paths` mapping with only `@codebuff/sdk`
- When migrating import paths from `@codebuff/sdk` → `@openbuff/sdk`, the per-package tsconfigs must be updated too, or typecheck fails with `Cannot find module '@openbuff/sdk'`
- The root tsconfig paths are NOT inherited by packages that define their own `paths` block — they override entirely

### 3. Env var alias precedence: new name takes precedence
- For `getOpenbuffApiKeyFromEnv()`, `OPENBUFF_API_KEY` takes precedence over `CODEBUFF_API_KEY` (correct rebrand direction — new name wins)
- This differs from the existing `getChatGptOAuthTokenFromEnv()` where `CODEBUFF_CHATGPT_OAUTH_TOKEN` (old name) takes precedence over `OPENBUFF_CHATGPT_OAUTH_TOKEN` — that's a pre-existing inconsistency, not introduced here
- Rationale: API key is the product's primary credential; ChatGPT OAuth token is upstream compat

### 4. Compat alias test pattern
- A dedicated `client-alias.test.ts` asserting `OpenbuffClient === CodebuffClient` (identity), constructability, and cross-name `instanceof` is more thorough than the existing split: `.js` tests test `OpenbuffClient` at runtime, `.ts` tests test `CodebuffClient` at type level
- The identity check (`expect(OpenbuffClient).toBe(CodebuffClient)`) guards against accidentally exporting two different classes

### 5. Broad sed migration scope discipline
- Exclude: compat test files (intentionally test the alias), JSON data fixtures (historical archived data), build artifacts (sdk/dist/*)
- Include: all live source .ts/.tsx/.md files in agents/, cli/src/, evals/, scripts/, sdk/e2e/, sdk/test/, sdk/src/__tests__/, sdk/examples/
- After sed, verify with `grep -rln` that remaining references are only in expected locations (compat alias definition, docs, dist artifacts)
- Always run typecheck across all affected packages (sdk, cli, agents, evals) to catch any missed references

### 6. Internal helper names can stay
- `getCodebuffClient`/`resetCodebuffClient` in cli/src/utils/codebuff-client.ts are internal CLI helpers, not consumer-facing
- Renaming them would require updating all call sites in cli/src/ for no consumer benefit
- The word-boundary sed naturally preserves them, which is the correct behavior


<!-- update_plan_status:appended -->
## M6.3 lessons — 2026-06-28 — 2026-06-28T01:38:29.989Z

- `update_plan_status` updates field does NOT match `- [todo]`/`- [done]` checklist lines in PLAN.md (as of this session). The substring match fails even on exact task descriptions. Workaround: use `str_replace` directly on the PLAN.md checklist line to toggle `[todo]`→`[done]`, and use `update_plan_status` only for STATUS.md/LESSONS.md appends + `currentTask`/`sessionStatus` fields.
- The inline gate-reviewer helper mirror in `base2.ts` (lines ~2140-2270) must be kept byte-synced with `agents/base2/gate-reviewer.ts`. The `gate-reviewer.test.ts` parity test (`exported helpers match inline base2 mirror behavior`) transpiles base2.ts via `Bun.Transpiler` and extracts the inline functions via `new Function(...)`, then asserts identical behavior. Any change to the exported helpers MUST be mirrored inline or the parity test fails. The transpiler loses module closures, so the inline copy cannot reference imports — everything must be self-contained.
- Coverage-adequacy contract is enforced only via the structured `coverage: "missing"` JSON field, not free text. This keeps the text-mode fallback path unchanged (reviewers that don't emit structured JSON are unaffected) while making the contract enforceable for structured-output reviewers. `n/a` is the escape hatch for non-behavioral changes (comments, formatting, pure-refactor) so reviewers aren't forced to demand coverage for trivial diffs.


<!-- update_plan_status:appended -->
## M8.1 lessons — 2026-06-28T02:20:34.610Z

## M8.1 — SDK failover bug + OPENBUFF_API_KEY audit lessons (2026-06-28)

### The failover bug pattern
- `resolveConfiguredAgentModelConfig` (provider-config.ts) had a precedence chain: mode → agent → defaultModel → explicit `model` param. The explicit `model` was a **last-resort fallback**, not a preferred override.
- Any caller that passes a `model` expecting it to win (e.g. the failover loop in `promptAiSdkStream`) would silently get the routing-chained model instead whenever routing exists — which is the common case (default config sets `defaultModel`).
- Fix: add an explicit opt-in flag `preferModelParam` rather than reversing the default precedence. The primary (failover index 0) must still honor routing; only failover candidates (index > 0) bypass it. Setting `preferModelParam: failoverIndex > 0` keeps the primary path's behavior stable.
- Reasoning effort is orthogonal to model routing — it should still resolve from the loaded config even when `preferModelParam` short-circuits the model resolution. The `providerConfigFileSchema.parse()` normalizes per-agent `reasoningEffort` into a separate `agentReasoningEfforts` map, so clearing `agents: {}` in a test config does NOT clear the per-agent effort.

### Testing gotcha
- When constructing test configs, use `providerConfigFileSchema.parse({...})` (validated + normalized) rather than an untyped `ProviderConfig` annotation. The schema normalizes `agents[base2].reasoningEffort` into `agentReasoningEfforts`, which changes the shape you think you're asserting against. The `base2` agent id does NOT automatically resolve to the `edit` mode — mode routing is a separate explicit config field, not an agent-id convention.

### OPENBUFF_API_KEY audit
- `OPENBUFF_API_KEY` is already inert in the local CLI: `getCodebuffClient()` never passes `apiKey` to `OpenbuffClient`, the SDK defaults it to `''`, and local BYOK routing uses per-provider `apiKeyEnv` from `openbuff.json` instead.
- The only consumers are self-contained: an env helper with zero non-test runtime callers, skipped integration tests, and manual Canopywave smoke scripts.
- Decision: do NOT bundle removal into M8.1. The `apiKey` field on `OpenbuffClient`/`RunOptions` is a legacy Codebuff-backend-compat slot; removing it touches the SDK public surface, env helpers, tests, scripts, and docs — scope it as a dedicated deprecation milestone instead.

### update_plan_status gotcha (repeated)
- The `update_plan_status` `task` matcher does not match `- [todo]`/`- [done]` checklist lines in PLAN.md — it only matches free-text task descriptions. To toggle a checklist line, use `str_replace` on the exact line text directly.


<!-- update_plan_status:appended -->
## M8.2 lessons — BYOK cost accounting — 2026-06-28T09:21:47.039Z

Date: 2026-06-28

### Cost-accounting fallback design
- The `pricing` capability already existed in the `providerConfigFileSchema` (inputPerMillionTokens / outputPerMillionTokens / cachedInputPerMillionTokens / currency) but was never consumed by the cost path. The cleanest fix was a pure helper (`computeCostCentsFromUsage`) that takes `usage` + `pricing` and returns cents | undefined, then wire it as a fallback only when `costOverrideDollars === undefined` (i.e. the provider did not return OpenRouter-style cost metadata). This preserves the existing provider-reported-cost path unchanged.

### Cached token semantics
- `cachedInputTokens` is the cache-hit portion of `inputTokens`. The helper charges `chargeableInputTokens = max(0, inputTokens - cachedInputTokens)` at the regular input rate and `cachedInputTokens` at `cachedInputPerMillionTokens` (falling back to the regular input rate when no cached rate is configured). This mirrors OpenRouter/OpenAI prompt-caching billing and avoids double-counting cached tokens against both rates.
- Clamp `chargeableInputTokens` to `max(0, ...)` so malformed provider data where `cachedInputTokens > inputTokens` cannot produce a negative input cost (the cached portion is still charged at the cached rate; only the non-cached portion is clamped). Covered by an explicit test case.

### Defensive numerics
- Treat negative, NaN, and non-finite token counts as 0 (`safeNonNeg`). Providers occasionally report `-1` or `null` for unused fields; without this guard, NaN poisons the whole computation and `onCostCalculated` receives garbage. Cheap insurance.
- Return 0 (not undefined) when pricing is configured but usage is empty/zero — distinguishes "I could compute a cost but the request was free" from "I have no pricing to compute with". The cost blocks only call `onCostCalculated` when the result is a number, so zero-cost requests still report.

### Type-only circular edge
- `model-provider.ts` imports `ModelPricing` from `../llm` as a type-only import (`import type`). `llm.ts` already imports runtime symbols from `model-provider.ts`, so a runtime import would create a true cycle; type-only is safe and typecheck-sdk confirmed no cycle error.

### Fallback wiring scope
- All three cost-bearing functions needed the fallback: `promptAiSdkStream`, `promptAiSdk`, `promptAiSdkStructured`. The non-stream functions destructured `pricing` from `getModelForRequest` in the same edit transaction that added the field to `ModelResult`. The stream path already destructured it alongside `reasoningEffort`/`effectiveModel`/`contextWindowTokens`.

### Reusable follow-up
- `computeCostCentsFromUsage` is exported and pure, so future cost surfaces (CLI status bar M9.3, evals/buffbench trace-analyzer) can reuse it directly instead of re-deriving from the schema. Consider exposing it from `sdk/src/index.ts` if external consumers need it.


<!-- update_plan_status:appended -->
## M8.3 lessons — retry unification + jitter — 2026-06-28T09:30:04.416Z

Lessons from M8.3 (unify retry config + add jitter):

- **Retry constants were drifted across two modules.** `MAX_STREAM_RETRIES=2` and `STREAM_RETRY_BASE_DELAY_MS=1000` lived inline in `llm.ts`, while `MAX_RETRIES_PER_MESSAGE=3` and `RETRY_BACKOFF_BASE_DELAY_MS=1000` were exported from `retry-config.ts`. The stream path silently retried one fewer time than the non-stream/database paths. Unifying onto the exported constants changed the stream retry count from 2 → 3 — a deliberate behavior correction, not a regression.

- **No jitter existed anywhere in the SDK retry paths before M8.3.** Both `llm.ts` stream retry and `database.ts` `fetchWithRetry` used raw exponential backoff with no randomization, leaving them susceptible to thundering-herd retries during a transient outage that hits many clients simultaneously. The new `computeBackoffDelayMs` helper applies ±20% jitter (matching the existing `common/src/util/promise.ts` strategy: `multiplier = (1 - frac) + Math.random() * 2*frac`), and caps the result at `RETRY_BACKOFF_MAX_DELAY_MS` after jittering.

- **`jitter=false` is the deterministic test escape hatch.** The helper accepts an optional `jitter` flag (defaults `true`) so tests can assert exact delay values without mocking `Math.random`. Without this, retry tests would be flaky. The flag is intentionally opt-out; production call sites never pass it.

- **`database.ts` `fetchWithRetry` previously had no max-delay cap on the jittered path?** Actually it had a cap via `Math.min(backoffDelay * 2, RETRY_BACKOFF_MAX_DELAY_MS)` before each sleep, but the cap was applied to the *base* delay before jitter would have been added — since there was no jitter, this was fine. After adding jitter, the helper caps again *after* jittering so a high jitter multiplier can't push the effective delay past the cap. This double-cap safety is important: cap the exponential base, then cap the jittered result.

- **Type-only import cycle avoided in M8.2 carried over as a pattern.** When threading `ModelPricing` into `model-provider.ts` from `llm.ts`, a `import type` was used to avoid a runtime cycle. For M8.3 there was no cycle risk since `retry-config.ts` has no imports from `llm.ts`/`database.ts` — it's a leaf constants module.

- **`update_plan_status` checklist matching is line-text-sensitive.** The PLAN.md M8.3 checklist line was `- [todo] M8.3 Unify retry config + add jitter.`; `str_replace` on the exact line text worked cleanly, but `update_plan_status`'s `updates[].task` matcher can miss lines with different surrounding prose. For checklist toggles, prefer direct `str_replace` on PLAN.md; reserve `update_plan_status` for STATUS.md/LESSONS.md appends.

- **Stream retry count is now testable.** With the local `MAX_STREAM_RETRIES` removed, the stream loop bound `MAX_RETRIES_PER_MESSAGE` is the same exported constant the retry-config tests assert against — so a future change to the retry count is covered by both the constant test and any test that drives the stream retry loop.


<!-- update_plan_status:appended -->
## M8.4 lessons — dead stub removal — 2026-06-28 — 2026-06-28T09:35:44.508Z

Lessons from M8.4 (remove dead `sdk/src/tools/run-file-change-hooks.ts` stub):

- **The stub was kept alive only by the `ToolHelpers` barrel re-export.** The runtime dispatch (`sdk/src/run.ts`) already imported the real executor from `./tools/file-change-hooks`, and the test (`sdk/src/__tests__/file-change-hooks.test.ts`) targeted the real impl directly. The dead stub survived solely because `sdk/src/tools/index.ts` re-exported it as `ToolHelpers.runFileChangeHooks`. Barrel re-exports can mask dead modules — a zero-consumer import search (e.g. `grep -rn 'run-file-change-hooks'`) is the reliable death certificate before deletion.

- **Rewire-then-delete is the safe order.** First rewired `index.ts` to import from the real impl (`./file-change-hooks`), verified typecheck, THEN deleted the stub file. This two-step order means any latent importer would surface as a typecheck error *before* the file is gone, rather than a runtime resolution failure after. Deleting first would make failures harder to diagnose.

- **`ToolHelpers.runFileChangeHooks` is now truthful.** The stub returned `{ stdout: 'File change hooks are not supported in the SDK environment.' }` — a no-op. After the rewire, the public barrel export actually runs configured hooks (loads from provider config, runs matching hooks concurrently). No internal callers used it, so this is a latent-correctness fix, not a runtime regression. External consumers (if any) who relied on the no-op behavior would now get real hook execution — but the no-op was never documented as a deliberate behavior, so this is a strict improvement.

- **Signature widening is safe for barrel re-exports.** The real impl's `runFileChangeHooks` has a richer signature (`{ files, cwd, env?, hooks?, runCommand? }`) than the stub (`{ files }`). Since `ToolHelpers` is a barrel re-export with zero internal `.runFileChangeHooks` call sites (confirmed by search), the signature widening is non-breaking — existing callers that pass only `{ files }` still satisfy the new (broader) signature because the added params are optional.

- **`update_plan_status` appends can silently no-op when the tool call is interrupted.** The M8.4 LESSONS.md append was in-flight when a prior compaction boundary hit; the STATUS.md append survived but the LESSONS.md append did not. On resume, cross-check that BOTH STATUS.md and LESSONS.md received the append before declaring the milestone closed (tail the file; don't assume the tool call succeeded).


<!-- update_plan_status:appended -->
## M9.1 lessons — 2026-06-28 — 2026-06-28T10:47:24.129Z

- **fuzzyMatch extraction:** The inline `fuzzyMatch` in `use-suggestion-engine.ts` was a module-private const. Extracting it to `cli/src/utils/fuzzy-match.ts` required adding it to the import list at the top of the file AND deleting the inline definition — both edits must land or you get a duplicate-identifier error. The atomic str_replace batch aborted on the first attempt because the multi-line `oldString` for the deletion had subtle whitespace drift; delegating the precise deletion to the editor agent (which reads exact lines first) was more reliable than fighting str_replace anchors.
- **`getAllPathsWithDirectories` builds paths from `node.name`, not `node.filePath`:** Test helpers that constructed `FileTreeNode` with `filePath: 'src/index.ts'` but `name: 'index.ts'` produced palette entries with path `'index.ts'`, not `'src/index.ts'`. The `filePath` field on `FileTreeNode` is ignored for path construction; only `name` (joined with ancestor names) is used. Tests must set `name` to the intended path segment, and nested paths are built by joining names (e.g. dir `name='src'` + child `name='index.ts'` → `'src/index.ts'`).
- **`FileTreeNode` uses `type: 'file' | 'directory'`, not `isDirectory`:** The schema field is `type`; `isDirectory` only appears on `PathInfo` (the flattened output of `getAllPathsWithDirectories`). Test helpers and any new code constructing nodes must set `type`, not `isDirectory`.
- **`scoreEntry` branch order matters for test expectations:** A query that is a *prefix* of the id hits the `-900` (id prefix) branch, not the `-800` (id substring) branch. Tests asserting substring-score values must use a query that is a genuine non-prefix substring (e.g. `'connect'` in id `'reconnect'` → `-800 + 2 = -798`), or the assertion will see the prefix score instead. Same for files: `'index'` is a filename *prefix* of `'index.ts'` → `-950`, not the substring `-800`.
- **Visual smoke tests need provider keys:** The `codebuff-local-cli` agent boots `bun --cwd=cli run dev`, which requires a provider API key to reach the chat surface. In environments without keys, the TUI cannot boot past the auth/connection gate, so Ctrl+P cannot be exercised. Document the cancellation in STATUS.md and rely on typecheck + unit tests of the pure helpers as the milestone validation; flag for manual visual test by a developer with keys.
- **TypeScript non-null assertion in `.toBeLessThan(scoreEntry(...)!)`:** `expect(a).toBeLessThan(scoreEntry(entry, q)!)` still passes `number | null` to `toBeLessThan`'s `number | bigint` parameter in TS's view — the `!` doesn't narrow the argument type at the call site. Extract to a `const x = scoreEntry(...)!` first, then `expect(a).toBeLessThan(x)`, to satisfy `tsc`.
- **Exporting types for testability:** The palette's `buildEntries`, `scoreEntry`, `entryToListItem`, and `PaletteEntry` were module-private. Exporting them (and the type) is a zero-cost change that enables focused unit tests without rendering the opentui/react component (which would need a terminal harness). Prefer this pattern for terminal-rendering components: keep the render logic private, export the pure helpers.


<!-- update_plan_status:appended -->
## M9.2 — /diff + /changes lessons — 2026-06-28 — 2026-06-28T10:56:19.527Z

- Alias uniqueness is enforced: the command-registry tests reject duplicate aliases across commands. `status` was already an alias of the `info` command, so reusing it as an alias for `/changes` caused 4 test failures. Before adding an alias, grep the existing command definitions for collisions.
- Slash commands have TWO alias lists that must stay in sync: one in `cli/src/data/slash-commands.ts` (for the suggestion menu) and one in `cli/src/commands/command-registry.ts` `defineCommandWithArgs` (for the dispatcher). Editing only one leaves the suggestion menu and dispatcher inconsistent.
- For git-utility slash commands, reuse the existing `runBashCommand` pattern (used by the `bash` command) so output flows through the existing bash message/history rendering — no new rendering surface needed.


<!-- update_plan_status:appended -->
## M9.5 gotcha — new required callback field broke test fixtures — 2026-06-28T11:30:53.765Z

Lesson: When adding a new required field to a `MessageBlockCallbacks`-style interface that is constructed inline in test fixtures, the test fixtures will fail typecheck (TS2741/TS2345) even though the implementation is correct. Always grep test files for inline construction of the interface (`setCallbacks({`, `defaultCallbacks = {`) and add the new field to all call sites, not just the production code. Centralizing test fixtures via a single `defaultCallbacks` object (and spreading it in inline call sites) minimizes this blast radius — prefer that pattern for future callback-type additions.


<!-- update_plan_status:appended -->
## M9.6 gotcha — fuzzyMatch is subsequence-only, not edit-distance — 2026-06-28T11:38:26.886Z

Gotcha: `fuzzyMatch(text, query)` requires every query character to be present in `text` in order; it returns `null` (not a poor score) if any query char is absent. When writing suggestion tests, pick typos whose every character exists in the target command/alias (e.g. transposition `'hlp'` vs `'help'`, or substring `'qu'` vs `'quit'`). A typo that introduces a foreign character (e.g. `'halp'` vs `'help'` — the 'a' is absent) will yield `null` and an empty suggestion list, failing the test even though the threshold is loose. This is by design (ordered subsequence matcher) but easy to misread as a threshold problem.


<!-- update_plan_status:appended -->
## Post-completion follow-up — librarian e2e flake (structuredOutput null-value quirk) — 2026-06-28T13:47:08.336Z

During the final whole-repo gate, the librarian e2e sub-suite (`agents/librarian/librarian.test.ts`) failed with a self-contradictory message: `❌ Expected structuredOutput, got: structuredOutput` / `0/2 tasks passed`. An audit traced this to a 3-layer chain, not a network flake:

1. **Agent behavior** — the librarian agent emitted a single text token (`"repoUrl"`) and finished without calling `set_output` (model nondeterminism; the `git clone` itself succeeded with exitCode 0).
2. **SDK contract** — `packages/agent-runtime/src/util/agent-output.ts:67-71` returns `{ type: 'structuredOutput', value: agentState.output ?? null }` for `outputMode: 'structured_output'` agents, so a run that never called `set_output` yields a well-formed envelope with a **null** payload.
3. **Test assertion** — `librarian.test.ts` only checked `output?.type === 'structuredOutput' && output.value !== null`, then fell through to an else-branch whose message (`Expected structuredOutput, got: ${output?.type}`) printed the same string on both sides, hiding the real (null-value) condition.

**Fix applied (this follow-up):** Added an explicit `else if (output?.type === 'structuredOutput' && output.value === null)` branch to `agents/librarian/librarian.test.ts` that surfaces the true failure mode (`set_output was never called`) with a diagnostic pointing at the trace. agents typecheck clean.

**Deferred follow-ups (NOT done — require separate discussion/scope):**
- **SDK contract change (secondary):** Consider returning `{ type: 'error', message: 'Agent did not call set_output' }` from `getAgentOutput` when `agentState.output` is null and `outputMode === 'structured_output'`, instead of `{ type: 'structuredOutput', value: null }`. This is a behavioral change to the `AgentOutput` discriminated-union contract (`common/src/types/session-state.ts:104`) with blast radius across all `getAgentOutput` consumers (`run-agent-step.ts:1337` is the only caller, but the SDK surface exposes it). Needs spec sign-off before implementing.
- **Network decoupling (tertiary):** The librarian tasks `git clone --depth 1` external public repos (expressjs/express, colinhacks/zod) at HEAD, coupling the suite to live GitHub availability/rate-limits. Pinning a commit SHA / vendoring a fixture repo would remove the environmental flake source. Out of scope for the assertion-message fix.

**Reusable pattern:** When a test's failure message is self-contradictory ("expected X, got X"), the real condition is almost always a *third* axis the if/else ladder doesn't branch on (here: `value === null` vs `value !== null` within the same `type`). Add the missing branch before trusting the message.


<!-- update_plan_status:appended -->
## Post-plan follow-up: two harness bug fixes (2026-06-29) — 2026-06-29T13:41:13.184Z

After the M1–M10 plan completed, two live harness bugs were reported and fixed outside the plan:

**Bug 1 — `suggest_followups` called before the automated reviewer re-ran:**
- Root cause: `canSuggestFollowups` was evaluated once at the top of base2's while-loop, before `yield 'STEP'`. New edits mid-step set `finalResponseGateOpen = false` but did not retract `canSuggestFollowups`, so a later batch in the same step could call `suggest_followups` before the gate re-ran. The same-batch `toolCalls.some(isFileChangingTool)` guard only caught edits in the same tool-call batch.
- Fix: In `agents/base2/base2.ts`, set `mutableAgentState.canSuggestFollowups = false` in both edits-detected blocks alongside `finalResponseGateOpen = false`. Complementary belt-and-suspenders fix in `packages/agent-runtime/src/tools/tool-executor.ts`: retract `agentState.canSuggestFollowups` immediately after a file-changing tool executes (covers cross-batch within a step).
- Test: `retracts canSuggestFollowups on agentState after a file-changing tool executes` in `packages/agent-runtime/src/__tests__/run-agent-step-tools.test.ts`.

**Bug 2 — Step-cap guard loops with the automated reviewer (infinite loop):**
- Root cause: When `stepsRemaining <= 0`, `runAgentStep` returned `shouldEndTurn: true`. The generator resumed with `stepsComplete: true`, fell through the `if (!stepsComplete) continue` guard, and ran the gate. If the reviewer returned BLOCKING or validation failed, the gate `continue`d → `yield 'STEP'` → step-cap fired again → generator resumed → gate ran again → infinite loop.
- Fix: Threaded a `hitStepCap` flag through the `STEP` yield result (`common/src/types/agent-template.ts` StepGenerator TNext type → `packages/agent-runtime/src/run-agent-step.ts` runAgentStep return + loopAgentSteps threading → `packages/agent-runtime/src/run-programmatic-step.ts` forwards to generator.next()) → base2 breaks out of its while-loop when `hitStepCap` is true instead of falling through to the gate.
- Backward compatible: `hitStepCap` is an optional field; agents without `handleSteps` skip `runProgrammaticStep` entirely; agents with `handleSteps` that don't check `hitStepCap` retain the original (buggy) behavior as opt-in.
- Test: `hitStepCap breaks out instead of falling through to the validation/reviewer gate` in `agents/__tests__/base2.test.ts`.

**Validation:** typechecks pass for agent-runtime, agents, common; both targeted test files pass including the two new regression tests. Automated validation/reviewer gate: LOOKS_GOOD.

**Minor non-blocking reviewer note:** the `hitStepCap` break path in base2 doesn't call `emitGateTelemetry` like other `final_response_allowed` transitions do — observability parity gap, not a correctness issue.

**Key source-verified finding for the executor:** `runAgentStep` is single-batch (one `processStream` call per invocation), so cross-batch tool calls within a single `runAgentStep` can't occur. The Bug 1 cross-batch scenario only matters across `yield 'STEP'` boundaries (between LLM steps), which base2's top-of-loop recompute already handles. The tool-executor mutation is defensive and doesn't change behavior for the single-batch case.


<!-- update_plan_status:appended -->
## Circuit-breaker reset-on-basedOnRead flaw — 2026-06-30 — 2026-06-30T08:14:16.506Z

## The structural flaw that made the existing circuit breaker unreachable in the re-read loop it was meant to catch There was already a `STR_REPLACE_MAX_CONSECUTIVE_FAILURES = 3` per-path breaker plus `consecutiveStrReplaceFailuresByPath` counter. The gap was in the `hasReadCapability` block at the top of every `str_replace` call, which cleared BOTH: ``` delete fileProcessingState.failedEditRequiresReadByPath[path] delete fileProcessingState.consecutiveStrReplaceFailuresByPath[path] // ← resets the breaker ``` The read-gate (`failedEditRequiresReadByPath`) forces a re-read after every failure; a re-read produces a fresh `basedOnRead`; that fresh `basedOnRead` cleared the counter **before** the breaker check. Net effect: the two gates cancelled out — the read-gate forced the very re-read that disarmed the breaker. The breaker could only trip if the model retried 3+ times WITHOUT any `basedOnRead`, which the read-gate already prevents. ## Fix Stop clearing `consecutiveStrReplaceFailuresByPath` when a `basedOnRead` is supplied. Keep clearing `failedEditRequiresReadByPath` (so the read-gate still works). The counter only resets on a genuine clean success (the existing line ~242). ## Preflight is NOT the gap Confirmed by re-reading `str-replace.ts` + `preflight-syntax-validation.ts`: `preflightValidateSyntax(path, fileProcessingResult.content)` runs `Bun.Transpiler.transformSync` on the **entire post-edit file content** (all replacements applied sequentially), not the newString in isolation. The `Unexpected .`/`)`/`}` rejections in the transcript were the harness working as designed — it correctly caught dangling-code states from fragmented/ambiguous-anchor edits. The real harness gap was solely the breaker being unreachable. ## Reusable pattern: two gates that share a clearing hook will cancel out When a safety gate (read-gate) forces an action (re-read) that another gate (breaker) keys on (`basedOnRead` presence), and both are cleared by the same hook, the gates silently neutralize each other. The diagnostic is: grep for every `delete fileProcessingState.X[path]` and ask 'does the action that clears gate A also produce the signal that clears gate B?' If yes, gate B is structurally unreachable whenever gate A is active. Fix by splitting the clearing hook, not by weakening either gate. ## Optional enhancement (not implemented) Track failure count by `(oldString, newString)` payload signature, not just by path. Same payload failing twice = definite loop (zero progress); different payloads failing on the same path = legitimate struggle. The path-based fix is sufficient for the transcript scenario (re-emitting the same broken `atomic` field 5x); the payload-signature enhancement would catch same-payload loops even sooner and avoid tripping on legitimate multi-edit struggle. Left as a follow-up. ## Edit mechanics note The str-replace.ts file is below the 1,000-line large-file threshold, so `basedOnRead` was ignored by the runtime (the edit applied by exact oldString match). For small-file edits, omit `basedOnRead` and rely on unique oldString anchoring — passing it just generates noise in the success message. ## Atomic string-field validation gotcha (recurring) During this task I hit the same `atomic: 'false'` (string vs boolean) tool-call schema error that plagued the model in the original transcript. The `str_replace` `atomic` param is a boolean; passing it as a string `''false''` is rejected by Zod with 'expected boolean, received string'. Omit it entirely for the default (false). This is a self-inflicted wound — the fix is to just NOT pass `atomic` at all when you want false.


<!-- update_plan_status:appended -->
## LESSONS — staleness checker CI flakiness (mtime → git log) — 2026-06-30T09:08:32.760Z

## Two-gates-with-shared-signal pattern: staleness checker CI flakiness

`checkStaleness` originally compared a `knowledge.md` **file** mtime against the sibling `src/` **directory** mtime. This is fundamentally flaky in CI:

1. Git does not preserve mtime across checkouts. A fresh `actions/checkout` writes files in tree order, so the directory mtime reflects the last *entry-set change* (last file written into the dir), not the last *content change*.
2. A knowledge.md that hasn't been touched in months can appear "stale" against a `src/` dir whose mtime merely reflects a recent file addition — even if the knowledge.md is still accurate.
3. The check fired deterministically on every CI run because `src/` was always written after `knowledge.md` in tree traversal.

`touch`-based local fixes don't survive — git doesn't track mtime, so CI resets it every checkout.

**The durable fix:** use `git log -1 --format=%ct -- <pathspec>` commit timestamps (the real source of truth for content recency). For directories, `git log` resolves to the last commit touching any file under that directory. Degrade gracefully: return `null` when git is unavailable or a path is untracked, and skip the check (no false positive) rather than guessing.

**Reusable rule:** any time-based drift check that must pass in CI should use git commit dates, not filesystem mtimes. Filesystem mtimes are a local-dev convenience, not a CI-stable signal.

**Test setup gotcha:** to test git-log-based checkers, set up a real `git init` in the temp dir and backdate commits with `GIT_AUTHOR_DATE` / `GIT_COMMITTER_DATE` env vars (not `utimesSync`, which only touches the working tree). `.git` must already be in the guard's `SKIP_DIRECTORIES` set so the repo metadata isn't scanned as content.

