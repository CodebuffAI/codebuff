# S1 — agent-runtime: loop & streaming

## [HIGH] security — packages/agent-runtime/src/run-programmatic-step.ts:296 — Stringified `handleSteps` executed via `new Function`
- **Risk:** A string-valued `template.handleSteps` is materialized into executable code via `new Function`; if any template loading path ever sources `handleSteps` from an untrusted location (DB row, remote agent registry, user-editable file under .agents), this is direct arbitrary code execution in the runtime process with access to env vars, secrets, and the host filesystem.
- **Fix:** Restrict stringified handleSteps to a clearly trusted-source allowlist (local in-repo agents only), and refuse stringified bodies sourced from DB/remote agent stores or surface a one-time consent prompt.
- **Evidence:** `typeof template.handleSteps === 'string' ? new Function(\`return (${template.handleSteps})\`)() : template.handleSteps`

## [MEDIUM] error-handling — packages/agent-runtime/src/tool-stream-parser.ts:121 — Tool input parse error swallowed to console.debug
- **Risk:** When AI SDK emits a tool-call with a raw JSON string `input` that fails to JSON.parse, the error is only logged via `console.debug` (not the structured logger) and the unparsed string is forwarded to the executor; the underlying failure mode is invisible in production logs.
- **Fix:** Route the warning through the injected `logger.warn` so the malformed-input path is observable and correlatable with userInputId.
- **Evidence:** `console.debug(\`[tool-stream-parser] non-JSON tool input for ${toolName}: ...\`)`.

## [MEDIUM] correctness — packages/agent-runtime/src/tools/tool-executor.ts:~470 — `tool_start` emission ignores promise rejection
- **Risk:** `previousToolCallFinished.then(() => onResponseChunk({type:'tool_start'...}))` has no rejection handler; if the barrier promise rejects (e.g. a prior write threw before settling), the `tool_start` chunk is silently dropped AND an unhandled promise rejection is generated.
- **Fix:** Use `.then(fn, fn)` or `.finally` so the transition fires on both settle paths and never produces an unhandled rejection.
- **Evidence:** `if (queued === true) { previousToolCallFinished.then(() => { onResponseChunk({ type: 'tool_start', toolCallId }) }) }` (both `executeToolCall` and `executeCustomToolCall`).

## [MEDIUM] state-mutation — packages/agent-runtime/src/tools/stream-parser.ts:~330 — `writeBarriersByPath.delete` race with same-path write reassignment
- **Risk:** The deletion is guarded by promise identity, but only after `settledToolPromise.then(...)`; between `setWriteBarrierForPath(writePath, settledToolPromise)` resolving and the cleanup callback running, a subsequent same-path write reads `writeBarriersByPath.get(writePath)` and chains on the about-to-be-deleted entry. The identity guard prevents wrongful deletion, but a later write that begins after deletion races and may not see the barrier; correctness depends on microtask ordering and is fragile.
- **Fix:** Replace the delete-after-settle pattern with a counter or generation token per path so the barrier map state is always consistent without relying on then-ordering.
- **Evidence:** `settledToolPromise.then(() => { if (writeBarriersByPath.get(writePath) === settledToolPromise) writeBarriersByPath.delete(writePath) })`

## [MEDIUM] correctness — packages/agent-runtime/src/tools/stream-parser.ts:~530 — Orphan tool_result for tool_call dropped on abort
- **Risk:** On abort, `filteredToolCalls` drops tool_calls that don't yet have results, but `toolResultsToAddToMessageHistory` is not filtered for results whose call was dropped — and in normal flow, the inverse (a result with no matching call) could leak. More critically, any tool result that completes AFTER the buildArray runs in the `finally` is lost from message history entirely (mutation occurs after this snapshot).
- **Fix:** Snapshot toolCallId pairing atomically (filter both sides by intersection) and consider awaiting outstanding promises with timeout even on abort.
- **Evidence:** `const completedToolCallIds = new Set(toolResultsToAddToMessageHistory.map(r => r.toolCallId)); const filteredToolCalls = toolCallsToAddToMessageHistory.filter(tc => completedToolCallIds.has(tc.toolCallId))`

## [MEDIUM] correctness — packages/agent-runtime/src/run-agent-step.ts:~870 — `compact` prompt overwrites entire message history irreversibly
- **Risk:** A user prompt whose lowercased value equals `/compact` or `compact` replaces `messageHistory` with a single summary derived from `fullResponse`; if the model produced empty/garbage text (provider error mid-step), the entire conversation is wiped to a near-empty message irreversibly.
- **Fix:** Guard the compact replacement on non-empty/sufficient-length summary content and/or keep a backup pointer for one turn.
- **Evidence:** `if (wasCompacted) { agentState.messageHistory = [userMessage(withSystemTags(\`...summary... ${fullResponse}\`))] }`

## [LOW] correctness — packages/agent-runtime/src/run-agent-step.ts:~552 — `nResponses` JSON.parse silent fallback masks malformed best-of-N
- **Risk:** On JSON.parse failure or non-array result, the full raw response string is wrapped as a single candidate; consumers that rely on `n` candidates may silently get 1, hiding model misbehavior.
- **Fix:** Emit a structured analytics event when n-response fallback triggers so degradation is visible.
- **Evidence:** `catch (e) { logger.warn(..., 'Failed to parse n-response array...'); nResponses = [responsesString] }`

## [LOW] error-handling — packages/agent-runtime/src/run-agent-step.ts:~1438 — Error stack included verbatim in user-facing output
- **Risk:** When `apiErrorDetails.statusCode` is undefined and an Error has a stack, the raw stack is appended to the user-visible output `message`, leaking internal file paths and line numbers to the client.
- **Fix:** Keep stacks in logger.error only; expose a generic message to the client.
- **Evidence:** `error.message + (apiErrorDetails.statusCode === undefined && error.stack ? \`\n\n${error.stack}\` : '')`

## [LOW] state-mutation — packages/agent-runtime/src/run-programmatic-step.ts:~470 — `agentRunContextRegistry` retains owner mapping past clearAll for testing
- **Risk:** `clearAgentGeneratorCache` calls `clearAllProposalLedgers` and `clearAll`; if generator-creation runs concurrently (extremely unlikely in test, but possible in prod via concurrent runs), `setGenerator` race-writes after clear and leaks the new generator under owner mapping that was just cleared.
- **Fix:** Serialize registry mutations under a lock or use a per-runId weak ref pattern.
- **Evidence:** `clearAllProposalLedgers(); agentRunContextRegistry.clearAll()` — no synchronization around concurrent runProgrammaticStep invocations.

## [LOW] performance — packages/agent-runtime/src/tools/tool-executor.ts:~640 — `getMCPToolData` called per executeCustomToolCall with cloneDeep
- **Risk:** Every custom tool call rebuilds the MCP tool definitions via `getMCPToolData({...writeTo: cloneDeep(fileContext.customToolDefinitions)})`; on agents with many MCP tools and many custom tool calls per turn this is a per-call deep clone in a hot path.
- **Fix:** Cache the assembled `customToolDefs` per (agentTemplate, fileContext) for the duration of a turn.
- **Evidence:** `customToolDefs: await getMCPToolData({ ..., writeTo: cloneDeep(fileContext.customToolDefinitions) })`

## [LOW] error-handling — packages/agent-runtime/src/tools/stream-parser.ts:~525 — `streamWithTags.return({aborted: true})` errors silently swallowed
- **Risk:** The catch block in finalization swallows all errors from generator cleanup; if the generator's finally block throws (e.g. a downstream `flush` callback throws), the error never reaches logs.
- **Fix:** Log via the injected logger before swallowing.
- **Evidence:** `try { await streamWithTags.return({ aborted: true }) } catch { /* ... */ }`

## [LOW] test-coverage — packages/agent-runtime/src/tool-stream-parser.ts — No test asserts buffered text flush on abort
- **Risk:** The `finally { flush() }` is explicitly comment-flagged as preserving text on abort, but there is no `tool-stream-parser.abort.test.ts` exercising mid-stream abort with buffered text — regressing the flush would not be caught.
- **Fix:** Add a unit test that injects an aborting generator with buffered text and asserts `onResponseChunk` received it.
- **Evidence:** Comment says "Without this, text streamed after the last tool call would be lost from the message history." — no matching test file in `__tests__/`.

## [LOW] correctness — packages/agent-runtime/src/main-prompt.ts:~95 — Cost-mode fallback chain returns 'base2' for unknown costMode
- **Risk:** `costMode ?? 'normal'` then index lookup on a record with 5 keys; if `costMode` is a string not in the record (e.g. typo via CLI), the lookup returns `undefined` and falls back to `'base2'` — an experimental agent — silently rather than rejecting the input.
- **Fix:** Validate costMode against the Record's keys and reject unknown values with a clear error.
- **Evidence:** `({ ask, lite, normal, max, experimental } satisfies Record<CostMode, AgentTemplateType>)[costMode ?? 'normal'] ?? 'base2'`
