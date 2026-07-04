# LESSONS — Agent trigger gates + git_branch tool

## Lessons discovered during the planning phase

### L1 — Only `code-reviewer` has an automated gate; the other three review/coverage agents are prompt-only

**Context:** Investigating the user's observation that `security-reviewer`, `doc-writer`, and `test-writer` are rarely triggered.

**Finding:** The orchestrator prompt (`agents/base2/base2.ts` lines 185–220) and the advisory sections in `agents/base2/quality-prompt-section.ts` (`securityReviewSection`, `gateAwarenessSection`) describe *when* the model should spawn these agents, but the language is advisory ("consider", "when required", "when directly implied by acceptance criteria") and the security section is explicitly labeled "advisory, not blocking" with a "for trivial changes… skip" carve-out. The only automated spawn is the `code-reviewer` gate hardcoded in `createBase2.handleSteps` (the validation/reviewer loop around lines 610–720 of `base2.ts`), which fires after validation passes regardless of model discretion.

**Reusable insight:** When an agent's trigger condition is prompt-only, the model will rationally under-trigger it because every spawn costs tokens/credits and the prompt never says "MUST." Reliable triggering of a phase-bounded agent requires a hardcoded gate in `handleSteps` keyed off objective file-set properties (globs, path patterns, package-presence-of-tests), not LLM discretion. The pattern for such a gate is already established (`code-reviewer`), so adding three more is mechanical.

### L2 — `gitBranch()` SDK helper exists but isn't exposed as an agent tool

**Context:** Investigating why git-committer doesn't handle branch creation.

**Finding:** `sdk/src/tools/git-branch.ts` exports `gitBranch()` — fully implemented, fully tested (`sdk/src/__tests__/git-branch.test.ts`, 295 lines covering dirty-tree refusal, branch-name validation, `switch: false` vs `switch: true`, error surfaces). But it is callable only from code that imports it (custom agents, the SDK's own `run.ts`). There is no `git_branch` entry in:
- `agents/types/tools.ts` `ToolName` union (only `git_status` is git-related, line 16).
- `common/src/tools/params/tool/` directory (only `git-status.ts` exists).
- `packages/agent-runtime/src/tools/handlers/tool/` directory (only `git-status.ts` handler exists).

The `git_discipline` section in `quality-prompt-section.ts` even references "The `git_branch` SDK helper refuses to switch branches on a dirty tree" — treating it as if it were an agent tool, when in fact it is not. This is an existing inconsistency worth fixing as part of R2.

**Reusable insight:** When a prompt section references a capability as if it's an agent tool but it's actually only an SDK function, the orchestrator model will hallucinate calling it and fail silently or fall back to `run_terminal_command`. Either expose the SDK function as a registered agent tool (`ToolName` union + params + handler + registry) OR change the prompt language to reflect that it's SDK-only.

### L3 — `handleSteps` is a generator, so adding a deterministic spawn step is one `yield`

**Context:** Reading `createBase2.handleSteps` (lines 347–2769 of `base2.ts`) to plan M3.

**Finding:** The gate loop already has `yield { toolName: 'spawn_agent_inline', input: { agent_type: 'context-pruner', params: ... }, includeToolCall: false }` and `yield { toolName: 'add_message', input: { role: 'user', content: ... } }` as the established pattern for deterministic spawn steps. Adding `security-reviewer` / `test-writer` / `doc-writer` spawn steps is the same shape: `yield { toolName: 'spawn_agent_inline', input: { agent_type: '<agent-id>', params: { changed_files: [...] } } }`. No new infrastructure needed — just the gate-predicate functions and the per-file-set idempotency flags on `Base2ActiveWorkState`.

**Reusable insight:** For any new deterministic phase-triggered spawn, the implementation pattern is: (1) add a boolean done-flag to `Base2ActiveWorkState` (initialize in the `activeWorkState = existingActiveWorkState ?? { ... }` block around line 380), (2) reset the flag when `pendingGateFiles` changes (use `gateFileSetsEqual`), (3) `yield` the `spawn_agent_inline` step at the right position in the loop, (4) set the flag after the spawn.

### L4 — The `qualitySection` / `securityReviewSection` / `gitDisciplineSection` strings are byte-frozen by a snapshot test

**Context:** Confirming the non-goal of NOT changing the advisory prompt text.

**Finding:** `agents/__tests__/quality-prompt-snapshot.test.ts` asserts byte-equality of `qualitySection`, `securityReviewSection`, `gitDisciplineSection`, and the `gitDisciplineSection` mentions of `git-committer` and `git_branch`. This means any change to those strings breaks the snapshot test. The automated gates in M3 add code paths in `handleSteps`, not text changes to the frozen prompt strings — so the snapshot test stays green. The `ToolName` union extension in R2b adds `'git_branch'` to the union but does not change any prompt string.

**Reusable insight:** When a frozen prompt section is referenced by a snapshot test, keep it byte-identical unless explicitly rewriting it (would require a deliberate `create_plan`-style update to the snapshot test). Adding new code paths that consume the section is safe; mutating the section is not.

### L5 — git-committer's `handleSteps is serializable` test catches top-level lexical binding capture

**Context:** R3c (git-committer step) — yielding `git_branch` from `handleSteps`.

**Finding:** `agents/__tests__/git-committer.test.ts` line 51–57 asserts:
```ts
const src = gitCommitter.handleSteps.toString()
expect(src).toMatch(/^function\*\s*\(/)
expect(() => new Function(`return (${src})`)()).not.toThrow()
```
The second assertion catches any closure over top-level lexical bindings (imports, module-scope consts), which would break sandbox serialization. The mitigation is to use inline literals: `yield { toolName: 'git_branch', input: { branch_name: params?.branch_name, switch: params?.branch_switch ?? true } } as ToolCall<'git_branch'>` — no closures, just destructured params and inline object literals. This mirrors the existing pattern in git-comitter's `handleSteps` (`yield { toolName: 'run_terminal_command', input: { command: 'git status --short' } }`).

**Reusable insight:** When extending any agent's `handleSteps`, never reference imports or module-scope names — use only `params`, inline literals, and `as ToolCall<'...'>` type assertions. The sandbox serializer strips top-level closures silently, so the test catches this before production.

### L6 — Open question verification ordering matters

**Context:** Q1 (`base2-deep.ts` share-or-copy) and Q2 (client-side `git_status` handler registration point) both gate implementation order.

**Finding:** Q1 determines whether M3 task P3.7 (mirror gates in base-deep) is needed or auto-handled. Q2 determines the exact file R2e touches. Both must be verified early in M1 — ideally before the first edit — because the answers change the modify-file list. The plan sequences these as P1.1 and P1.2 (first two tasks) explicitly for this reason.

**Reusable insight:** When a plan has open questions whose answers change the modify-file list, sequence their resolution as the first implementation tasks, and record the answer in LESSONS.md via `update_plan_status` (append) so resumption doesn't re-ask the same question.

<!-- update_plan_status:appended -->
## M1 implementation — Q1/Q2 resolutions + three gotchas — 2026-07-05 — 2026-07-04T22:27:43.933Z

M1 (`git_branch` agent tool registration) is complete. VG1 green: typechecks pass across `common`, `packages/agent-runtime`, `sdk`, and `agents`; 15/15 new unit tests pass (11 params schema + 4 handler).

Q1 RESOLVED: `base2-deep.ts` calls `createBase2(...)` and does NOT define its own `handleSteps`. Adding gates to `createBase2.handleSteps` applies to `base2-deep` automatically, so **P3.7 (mirror gates in base-deep) is `cancelled`** — not needed. Verified via `read_outline` on `base2-deep.ts`.

Q2 RESOLVED: The client-side tool dispatcher is `handleToolCall()` in **`sdk/src/run.ts`** (the `else if (toolName === '<name>')` chain around lines 880–931). `git_status` is dispatched at line 917 to `gitStatus()` imported from `./tools/git-status`. The new `git_branch` case is added immediately after the `git_status` case, calling `gitBranch()` from `./tools/git-branch`.

### Gotcha 1 — `gitBranch()` returns a single `GitBranchResult`, not a `ToolResultOutput[]`
Unlike `gitStatus()` (which returns the array shape `[{ type: 'json', value: ... }]` directly), `gitBranch()` returns a single `GitBranchResult` object: `{ branch, created, switched, previousBranch?, errorMessage? }`. The `result` variable in `sdk/src/run.ts` `handleToolCall` is typed `ToolResultOutput[]`, so assigning the raw `gitBranch()` output triggers `TS2740` (missing `length`/`pop`/`push`/...). Fix at the dispatch site: call `gitBranch()`, then wrap the result into a singleton array, branching on `errorMessage`:
```ts
const { errorMessage, ...successValue } = branchResult
result = [{ type: 'json', value: errorMessage !== undefined ? { errorMessage } : successValue }]
```
Reusable insight: when wrapping an SDK function as an agent tool, check the function's return shape against `CodebuffToolOutput<T>` BEFORE wiring the dispatch case. Single-object returns need a wrap step; array-shaped returns can be assigned directly. The `gitStatus()` function was already returning the array shape, which is why its dispatch site has no wrapper — that's the exception, not the rule.

### Gotcha 2 — `edit_transaction` `occurrenceIndex` is per-unique-oldString, applied sequentially
`common/src/tools/constants.ts` has two arrays (`toolNames` and `publishedTools`) that both contain the exact substring `'git_status',\n  'glob',`. Passing `oldString: "  'git_status',\n  'glob',"` with `occurrenceIndex: 1` and then `occurrenceIndex: 2` in the same atomic batch fails: after occurrence 1 applies, that exact `oldString` no longer exists in the file, so occurrence 2 throws `only 1 exact occurrence(s) of the oldString exist`. Fix: give each replacement a longer, unique `oldString` (include trailing context that distinguishes the two arrays — e.g., `toolNames` ends with `'spawn_agent_inline',` while `publishedTools` ends with `'spawn_agents',` without the inline entry). Reusable insight: when the same short string appears in multiple array literals, extend each `oldString` with enough surrounding context to make it globally unique, rather than relying on `occurrenceIndex` across an atomic batch.

### Gotcha 3 — Test-writer mock pattern needs explicit param types when args are cast `as unknown as`
The handler test uses `as unknown as Parameters<typeof handleGitBranch>[0]` to satisfy the args type. Inside that cast object, inline `requestClientToolCall: async (clientToolCall) => {...}` infers `clientToolCall: any` (TS7006) because the contextual type is erased by the `as unknown` cast. Fix: annotate the callback param explicitly: `async (clientToolCall: ClientToolCall<'git_branch'>) => {...}`. Reusable insight: when test code casts composite args to `unknown` first to satisfy a precise type, inline callbacks inside that object lose contextual typing — annotate their params explicitly.

### M1 files produced/modified
NEW: `common/src/tools/params/tool/git-branch.ts`, `packages/agent-runtime/src/tools/handlers/tool/git-branch.ts`, `common/src/tools/params/tool/__tests__/git-branch.test.ts`, `packages/agent-runtime/src/tools/handlers/tool/__tests__/git-branch.test.ts`
MODIFIED: `agents/types/tools.ts` (ToolName + ToolParamsMap + GitBranchParams), `common/src/tools/constants.ts` (toolNames + publishedTools), `common/src/tools/list.ts` (toolParams + clientToolCallSchema), `packages/agent-runtime/src/tools/handlers/list.ts` (codebuffToolHandlers), `sdk/src/run.ts` (import + dispatch case + wrapper).

### M1 acceptance criteria satisfied
- AC4 (partial — tool plumbing layer): `git_branch` is in `ToolName`, `ToolParamsMap`, `toolNames` + `publishedTools` registries, has a params schema + handler, and the SDK dispatch case calls `gitBranch()`. Orchestrator invocation via `spawn_agents` is M3's concern.
- AC6 (partial): `common`, `packages/agent-runtime`, `sdk`, `agents` typechecks all green.
- AC7 (partial): new git-branch params + handler tests pass (15/15). `agents/__tests__/quality-prompt-snapshot.test.ts` and `agents/__tests__/new-bundled-agents.test.ts` not yet re-run — scheduled for M4/VG4.

Next: M2 (git-committer branch capability) — the `git_branch` tool is now available for git-committer's `toolNames` and `handleSteps`.


<!-- update_plan_status:appended -->
## M2 implementation — git-committer branch capability + test-assertion type-narrow gotcha — 2026-07-05 — 2026-07-04T22:30:27.416Z

M2 (git-committer branch capability, R3) is complete. VG2 green: `cd agents && bun run typecheck` passes; 24/24 git-committer tests pass including the 7 new branch tests (branch_name/branch_switch in inputSchema, instructionsPrompt mentions git_branch, spawnerPrompt mentions branch, handleSteps yields git_branch step first when branch_name provided, omits when not).

GOTCHA — `inputSchema.params` is a JSON Schema whose `properties` value can be a boolean-schema (`true`/`false`) per the JSON-Schema spec, so TypeScript types `properties?.branch_name` as `{type?: ...} | boolean`. Indexing `.type` / `.default` on it produces TS2339 (`Property 'type' does not exist on type 'boolean | JsonSchema'`). Fix: narrow with a type guard before indexing field metadata — `(branchParams as { properties?: Record<string, { type?: string; default?: unknown }> }).properties` after checking `typeof branchParams === 'object' && 'properties' in branchParams`. REUSABLE: when asserting on JSON-Schema field metadata in tests, always narrow the schema object first — JSON-Schema's boolean-schema variant is valid and breaks naive field access.

GOTCHA — `bun test agents/__tests__/git-committer.test.ts` (without `./` prefix) prints `The following filters did not match any test files` and exits 0, giving a false-green. The filter is treated as a name pattern, not a path. Fix: use `bun test ./__tests__/git-committer.test.ts` (with `./` prefix) so bun treats it as a file path. REUSABLE: always prefix test file paths with `./` when invoking `bun test <path>` to avoid silent no-match false-greens.

R-RISK-5 (closure over top-level bindings) did NOT fire — the `git_branch` yield in handleSteps uses inline literals `{ branch_name: params?.branch_name, switch: params?.branch_switch ?? true }`, so the `handleSteps is serializable (function* form)` test stayed green. Confirmed by the test passing.


<!-- update_plan_status:appended -->
## Resumption lessons — M3-was-already-implemented + inline-test pattern — 2026-07-04T22:48:25.171Z

Resumption gotchas confirmed when picking this session up after compaction:

1. **M3 source implementation was already present at resume time.** P3.1–P3.9 (glob matching, state fields, three gate predicates, handleSteps wiring, runValidationGate guard, file-set-change reset) were all already implemented in `agents/base2/base2.ts` and `agents/base2/gate-state.ts` from a prior session. The ONLY remaining M3 deliverable was the missing unit test `agents/__tests__/gate-aux-triggers.test.ts` (P4.1). Before assuming M3 work is needed, grep for `matchesSecuritySensitiveGlob` / `selectTestWriterTargets` / `selectDocWriterTargets` in `base2.ts` — if they're defined AND invoked from `handleSteps` AND the `*GateDone` fields exist on `Base2ActiveWorkState`, M3 source is done and only VG3 (tests + typecheck) remains.

2. **`micromatch` is intentionally NOT used in `handleSteps` gates.** The inline gate predicates use self-contained string/regex matching (`SECURITY_SENSITIVE_GLOBS` + `SECURITY_SENSITIVE_NAME_SUBSTRINGS`) because `handleSteps` is serialized via `.toString()` and reconstructed with `new Function(...)`. Module-scope imports (like `micromatch`) would be `undefined` at reconstruction time. This is documented in the `base2.ts:1603-1610` comment. When adding new predicates to `handleSteps`, keep them import-free and self-contained.

3. **Inline-function test extraction pattern (reuse).** `agents/__tests__/gate-reviewer.test.ts` already establishes the `Bun.Transpiler` + `extractInlineFunctionSource` + `new Function(...)` pattern for testing inline `handleSteps` helpers that are NOT exported. `gate-aux-triggers.test.ts` extends `extractInlineFunctionSource` to balance `[`/`]` as well as `{`/`}` so it can also extract `const` array declarations the functions depend on. `process` must be passed as a `new Function('process', ...)` parameter so `normalizeGateFilePath`'s `process.cwd()` reference resolves at runtime. Future inline-helper tests should follow this same pattern.

4. **`evals/buffbench/eval-task-generator.ts` had a pre-existing typecheck regression** (`agentDefinitions: allAgentDefinitions` where the array widened to `(AgentDefinition | SecretAgentDefinition)[]` but SDK `client.run()` accepts only `AgentDefinition[]`). Fixed with a targeted cast at the construction site during resume context-gathering — unrelated to the durable plan but was blocking the broader typecheck. REUSABLE: when imported agent definitions are `SecretAgentDefinition` and the SDK wants the public `AgentDefinition`, cast each definition at the array-construction site so the array unifies to the SDK-accepted type.

5. **Pinned active-work state can lag the durable plan state.** The harness pinned state listed M1/M2 files as "pending validation" and pointed at `M3 P3.1` as the next action, but the durable STATUS.md said M1+M2 done and M3 source already implemented. Per EXECUTE_PLAN guidance, the durable artifacts are authoritative — confirmed by reading source. When the pinned state and STATUS.md disagree, trust STATUS.md and verify with a quick source grep.

