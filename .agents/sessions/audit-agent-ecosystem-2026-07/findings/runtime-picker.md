# Runtime/contracts/routing picker audit

## Flow inventory for paired code-searcher

- Registration: `sdk/src/agents/load-agents.ts:106-139,201-318` recursively imports project/parent/home `.agents`, resolves MCP env references, keys definitions by ID, and optionally validates; `packages/agent-runtime/src/templates/agent-registry.ts:21-87,93-110` resolves local templates first and has a disabled-in-local-mode database fallback.
- Routing/BYOK: `packages/agent-runtime/src/main-prompt.ts:93-151` chooses explicit agent ID or legacy cost-mode alias; `packages/agent-runtime/src/run-agent-step.ts:556-576` sends the stable agent type to SDK routing; `sdk/src/impl/agent-runtime.ts:64-107,129-137` wires local provider calls and disables remote registry/analytics/billing.
- Execution/output: `packages/agent-runtime/src/run-agent-step.ts:801-1398` builds prompts/tools, runs programmatic and LLM steps, prunes context, checkpoints, and returns `getAgentOutput`; `run-programmatic-step.ts:241-320,385-592` materializes generators, executes yields, and records errors/output.
- Permissions: spawn authorization is in `spawn-agent-utils.ts:176-249`; input validation is `:251-369`; filesystem path/commit policy is `sdk/src/tools/filesystem-authority.ts:165-243`; terminal containment is `sdk/src/tools/run-terminal-command.ts:141-161`.
- Spawn lifecycle: foreground/background dispatch is `spawn-agents.ts:95-393`; inline shared-history dispatch is `spawn-agent-inline.ts:97-200`; depth/timeout/cancellation is `spawn-agent-utils.ts:460-629`; background storage is `util/background-agent-jobs.ts:76-222`.
- Telemetry/cost: turn cost resets/finish event are `main-prompt.ts:182-190,245-265`; per-step cost/cache accumulation and budget checks are `run-agent-step.ts:367-383,440-454,705-755`; foreground subagent cost aggregation is `spawn-agents.ts:349-390`.
- Key tests present: main prompt, programmatic steps, spawn permission/nesting/history/images/depth/timeout, budgets/context pruning, agent loading/validation, terminal containment, code-search parsing/limits/abort, and filesystem authority. Important missing cases are called out below.

## Findings

## [HIGH] Security — `sdk/src/agents/load-agents.ts:73-79,243-255`; `packages/agent-runtime/src/run-agent-step.ts:456-474`; `packages/agent-runtime/src/tools/handlers/tool/spawn-agent-utils.ts:448-456` — resolved MCP secrets are logged inside whole agent templates
- **Risk:** `$TOKEN` references are replaced with plaintext environment values, after which debug logs serialize the entire `agentTemplate`; local logs can therefore contain MCP/API credentials.
- **Fix:** retain secret references until process launch or redact all `mcpServers.*.env` values before logging templates; never log the full template object.
- **Evidence:** `resolveAgentMcpEnv(processedAgentDefinition)` mutates config, while both step and spawn logs include `agentTemplate` verbatim.

## [HIGH] Security / API contract — `packages/agent-runtime/src/run-programmatic-step.ts:700-717,750-759` — programmatic agents bypass declared tool capabilities
- **Risk:** a `handleSteps` agent may execute terminal, edit, spawn, or network tools even when absent from its `toolNames`, defeating the agent permission model and making a nominally read-only subagent write-capable.
- **Fix:** enforce membership in the effective allowed tool set, with an explicit narrowly-scoped privileged capability for trusted orchestrators instead of a blanket bypass.
- **Evidence:** the availability check is commented out with “You can run any tool from handleSteps now!”, then `executeToolCall` receives the arbitrary yielded name.

## [HIGH] Security — `packages/agent-runtime/src/tools/handlers/tool/web-search.ts:67-105`; `common/src/tools/params/tool/web-search.ts:17-23` — direct URL fetch is an SSRF primitive
- **Risk:** any syntactically valid URL is fetched with redirects and no protocol/private-address guard, allowing prompt-injected agents to probe localhost, LAN services, or cloud metadata endpoints. `response.text()` also buffers the complete body before the 50k-character truncation.
- **Fix:** allow only HTTP(S), resolve and block loopback/link-local/private/reserved addresses on every redirect, and stream with a hard byte cap.
- **Evidence:** schema uses only `z.string().url()` and handler calls `fetch(fetchUrl)` directly, then awaits the unbounded `response.text()`.

## [HIGH] Correctness / state mutation — `packages/agent-runtime/src/tools/handlers/tool/spawn-agents.ts:95-203` — mixed background batches can create unreachable orphan work
- **Risk:** background entries are validated and launched sequentially before foreground processing. If a later entry is invalid, the handler throws after earlier jobs started but before returning their job IDs, leaving detached work the parent cannot poll or cancel.
- **Fix:** pre-validate every batch entry before launching any, then use per-entry `allSettled` reporting and always return IDs for successfully-started jobs.
- **Evidence:** `backgroundReports` is returned only at the end, while each detached promise is attached during the initial `for` loop and validation errors are not caught per entry.

## [HIGH] State mutation / performance / information exposure — `packages/agent-runtime/src/util/background-agent-jobs.ts:76-76,161-170,195-215`; adjacent `tools/handlers/tool/check-background-agent.ts:61-75,93-109` — completed background jobs retain and return full internal run state forever
- **Risk:** the process-wide map has no deletion/TTL/cap; each settled result is the entire `executeSubagent` result, including `agentState` message history, system prompt, tool definitions, and proposal state. This grows memory across a session and injects oversized/internal prompt state back into the parent when polled.
- **Fix:** store a normalized result `{ output, cost, agentId, status }`, redact internal state, add TTL/LRU cleanup plus explicit consume/delete, and cap total jobs.
- **Evidence:** `job.result = result`, `jobs` is never pruned, and polling returns `result: job.result` verbatim.

## [HIGH] Correctness / cancellation — `sdk/src/tools/run-terminal-command.ts:248-279,288-301` — timeout/abort can leave the command running after the tool has rejected
- **Risk:** timeout sends only SIGTERM and marks `processFinished` before process exit, with no SIGKILL fallback. Abort's fallback checks `childProcess.killed`, which means a signal was sent, not that the process exited, so SIGKILL commonly never fires. Long-lived grandchildren may survive while the agent believes execution stopped.
- **Fix:** wait for `close`, escalate after a grace period based on observed exit, kill the process group where supported, and add stubborn-process timeout/abort tests.
- **Evidence:** timeout immediately rejects after `kill('SIGTERM')`; abort fallback is gated by `if (!childProcess.killed)`.

## [HIGH] Correctness / BYOK compatibility — `packages/agent-runtime/src/run-agent-step.ts:835-838,1203-1236`; `util/context-pruning.ts:23-76` — runtime pruning/status is not connected to the resolved model context window
- **Risk:** `maxContextLength` has no caller in the audited tree, so runtime semantic pruning and the CLI `context_window.max` default to 190k even for BYOK models with 8k/32k windows. The SDK emergency trim may save the request, but the agent prunes too late and the UX reports a false capacity.
- **Fix:** return resolved `contextWindowTokens` from routing before the loop or inject a model-capability resolver, then use `getModelContextMessageLimit` consistently for pruning and status.
- **Evidence:** the loop accepts an optional value and otherwise emits `DEFAULT_MAX_CONTEXT_TOKENS`; repository search found no value passed into this parameter.

## [MEDIUM] Error handling / UX contract — `packages/agent-runtime/src/main-prompt.ts:200-241` — invalid agent configuration emits an error and then continues the run
- **Risk:** the client can receive `prompt-error`, followed by `start`, streamed content, `finish`, and `prompt-response` for the same prompt. This creates ambiguous terminal state and may run a different surviving agent despite a broken configuration.
- **Fix:** either fail closed before `start`, or downgrade unrelated invalid definitions to a distinct non-terminal warning event with file paths and continue explicitly.
- **Evidence:** after sending `prompt-error` for non-empty `validationErrors`, execution unconditionally sends `start` and calls `mainPrompt`.

## [MEDIUM] Correctness / UX — `sdk/src/agents/load-agents.ts:135-139,212-263`; `sdk/src/__tests__/load-agents.test.ts:694-731` — global agents silently override project agents and duplicates disappear before validation
- **Risk:** directories are loaded project → parent → home but assignment is last-wins, so a home definition silently replaces the project-local definition. Duplicate IDs are collapsed before validation, and the existing test explicitly makes no duplicate assertion.
- **Fix:** define and test precedence (normally project > parent > home), retain provenance for every candidate, and report duplicate/override diagnostics.
- **Evidence:** `agents[id] = processedAgentDefinition` overwrites prior entries; the duplicate-ID test only asserts that a result exists.

## [MEDIUM] API/ABI contract — `common/src/types/agent-template.ts:148-156`; `common/src/types/dynamic-agent-template.ts:175-217`; `packages/agent-runtime/src/tools/handlers/tool/spawn-agent-utils.ts:527-533`; `common/src/constants/agents.ts:122-130` — advertised spawn-depth configuration is not loadable
- **Risk:** runtime/type/docs tell users to configure `maxSpawnDepth` on an agent template or in `openbuff.json`, but the dynamic agent schema and provider config do not expose that field, so user configuration is stripped/ignored.
- **Fix:** add validated global and per-agent schema fields with precedence tests, or remove the unsupported configuration claims.
- **Evidence:** `AgentTemplate` reads the field and the error recommends it, while `DynamicAgentDefinitionSchema` omits it and no provider-config route exists.

## [MEDIUM] Performance — `sdk/src/tools/code-search.ts:98-113,326-397`; `sdk/src/tools/find-files-matching-content.ts:587-665` — context flags can bypass code-search memory/output guards
- **Risk:** `-A/-B/-C` accept arbitrary values; context events are always appended and do not trigger global/output-size stopping because the checks run only for match events. One match plus huge context can accumulate a file-sized in-memory array before final truncation.
- **Fix:** bound context counts, include context bytes/events in hard limits, and stop immediately when estimated output reaches the cap.
- **Evidence:** `shouldInclude = !isMatch || ...`, but limit checks are nested under `if (isMatch)`; flag parsing validates presence, not numeric range.

## [MEDIUM] Security / UX permissions — `common/src/tools/params/tool/run-terminal-command.ts:76-103`; `packages/agent-runtime/src/tools/handlers/tool/run-terminal-command.ts:20-32`; `sdk/src/run.ts:1082-1091` — terminal approval is prompt guidance, not an enforceable capability
- **Risk:** any agent with the tool (and every programmatic agent via the bypass above) can run arbitrary `bash -c` commands with the process environment; there is no typed approval token or side-effect policy between the model call and SDK execution.
- **Fix:** add command risk classification plus explicit user approval/capability receipts for destructive, network, credential, install, git-history, and out-of-project effects; apply it equally to subagents/programmatic calls.
- **Evidence:** the schema merely tells the model to ask, while the handler forwards directly and SDK executes directly after cwd containment.

## [MEDIUM] Security / error handling — `packages/agent-runtime/src/run-agent-step.ts:1462-1497` — internal stack traces are included in user-visible agent output
- **Risk:** non-HTTP failures expose local absolute paths and implementation details in CLI/error history, and may feed those internals into later model context.
- **Fix:** log stack traces only to the logger; return a stable sanitized code/message and an optional correlation ID.
- **Evidence:** `fallbackMessage` appends `error.stack` when no HTTP status, then returns it as `output.message`.

## [MEDIUM] Telemetry / UX — `packages/agent-runtime/src/tools/handlers/tool/spawn-agents.ts:349-390`; `packages/agent-runtime/src/main-prompt.ts:245-253`; `packages/agent-runtime/src/tools/handlers/tool/end-turn.ts:1-19` — background-agent cost and lifecycle are absent from turn totals/end-turn warnings
- **Risk:** only foreground child cost is added to the parent and `finish.totalCost`; shell jobs are warned about at `end_turn`, but the separate background-agent registry is not. Users can end a turn unaware of running agents and see understated spend.
- **Fix:** unify pending-job accounting, surface running background agents at end-turn/session exit, add kill/cancel, and aggregate settled cost into session telemetry without double counting.
- **Evidence:** foreground-only aggregation is explicit; background results remain separate and end-turn queries only `pending-background-jobs`.

## [LOW] Correctness / state mutation — `packages/agent-runtime/src/run-programmatic-step.ts:244-263` — run-ID collision resumes the wrong generator after only a warning
- **Risk:** if a dependency/test/custom run allocator returns a duplicate ID, one agent continues another agent's generator and mutable workflow state.
- **Fix:** fail closed, clear the conflicting registry entry, and mark both runs failed; do not continue after detecting mismatched owners.
- **Evidence:** owner mismatch logs `logger.warn` but leaves `generator` intact.

## [LOW] Dependency hygiene / cancellation — `packages/agent-runtime/src/tools/handlers/tool/web-search-utils.ts:24-58`; `web-search.ts:75-81,144-145` — web-search timeout does not cancel underlying work and relies on an internal package subpath
- **Risk:** `Promise.race` times out without aborting DuckDuckGo work, and `open-websearch/build/engines/...` is a private deep import likely to break on upstream layout changes. URL fetch also uses only an independent timeout signal, not the user/run abort signal.
- **Fix:** use a public package API with AbortSignal support and combine run cancellation with timeout.
- **Evidence:** the timer rejects separately while `searchDuckDuckGo` receives no signal; import targets `build/engines/duckduckgo/index.js`.

## [LOW] Correctness / cache UX — `packages/agent-runtime/src/run-agent-step.ts:984-1019`; `packages/agent-runtime/src/main-prompt.ts:118-129` — system prompt cache invalidates only on agent-type changes
- **Risk:** file tree, routed knowledge, patterns, and system/git context can change during a session but the cached system prompt remains byte-stable, so later turns may reason from stale project metadata.
- **Fix:** cache by a fingerprint of prompt-affecting file context/config, preserving provider cache hits while invalidating on relevant changes.
- **Evidence:** the only explicit invalidation clears `systemPrompt` on agent type change; otherwise the prior system prompt is reused.

## Eight-domain coverage

| Domain | Result |
|---|---|
| Security | Secret logging, programmatic capability bypass, SSRF, prompt-only terminal permissions, stack leakage. |
| Correctness | Partial background launches, process-reaping bugs, model-window mismatch, config/event ambiguity, precedence/depth contracts. |
| State mutation | Unbounded background registry/full-state retention, orphan jobs/processes, collision continuation, stale cache. |
| Error handling | Error-then-success event sequence, internal stacks, partial batch failure, cancellation misclassification risks. |
| Performance | Retained job state, unbounded web body, context-line accumulation, uncancelled web work. |
| Dependency hygiene | Fragile `open-websearch/build/...` deep import; no other concrete dependency defect established in this shard. |
| Test coverage gaps | No web-search handler security/cancellation tests; no mixed background failure/cleanup/redaction tests; no stubborn terminal process tests; no programmatic tool-permission test; duplicate-agent test has no duplicate assertion; no model-specific runtime context test. |
| API/ABI contracts | Unsupported `maxSpawnDepth` config, silent agent precedence, background result shape exposes internals, invalid-config terminal event ambiguity. |
