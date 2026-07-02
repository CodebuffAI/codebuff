# S3 — agent-runtime: context, tokens, pruning

## [MEDIUM] security — packages/agent-runtime/src/util/cache-debug.ts:241 — Full cache-debug snapshots persist prompts and message history in the repo
- **Risk:** When `CACHE_DEBUG_FULL_LOGGING` is enabled, the runtime writes the full system prompt, tool definitions, and serialized message history under `<projectRoot>/debug/cache-debug`. That can persist secrets, user data, tool results, and private code snippets into a project directory that may be accidentally committed or shared. The later provider-request enrichment summarizes data URLs, but the initial `preConversion.messages` path does not apply that redaction pass.
- **Fix:** Gate full snapshot writing behind an explicit local-dev confirmation and redact known secret-bearing fields/content by default; write outside the repo or add an enforced gitignore check; apply the same large/media summarization to `preConversion.messages` before writing.
- **Evidence:** `createCacheDebugSnapshot` builds `preConversion: { systemPrompt: system, toolDefinitions, messages: messages.map(serializeMessage) }` and immediately calls `writeSnapshot({ snapshot, logger })`.

## [MEDIUM] performance — packages/agent-runtime/src/util/stream-xml-parser.ts:83 — Unterminated streamed tool call buffers unbounded text
- **Risk:** Once `state.insideToolCall` is true, every chunk before a closing `</codebuff_tool_call>` is concatenated into `state.buffer` and withheld from `filteredText`. A malformed or adversarial model response that opens a tool tag and never closes it can grow memory for the rest of the stream and suppress all subsequent user-visible text.
- **Fix:** Add a maximum buffered tool-call size and/or timeout; when exceeded, emit a structured parser error, reset `insideToolCall`, and flush a safe excerpt rather than retaining unlimited content.
- **Evidence:** The no-end-tag branch sets `state.buffer = text` and waits for a future end tag; there is no byte/token cap on the buffer.

## [MEDIUM] correctness — packages/agent-runtime/src/util/messages.ts:315 — Kept messages can make trimming return over budget
- **Risk:** `trimMessagesToFitTokenLimit` promises a history that fits the token limit, but if `keepDuringTruncation` messages alone exceed the available message budget, `tokensToRemove` becomes negative. The removal loop then treats the removal target as already satisfied and keeps every message, returning an over-budget context that can still overflow the provider window.
- **Fix:** Detect `requiredTokens > maxMessageTokens` before the removal pass; simplify/truncate eligible kept tool results, then fail closed with a clear error or bounded emergency truncation if mandatory content still cannot fit.
- **Evidence:** `requiredTokens` is computed from kept messages, then `tokensToRemove = (maxMessageTokens - requiredTokens) * 0.5`; the loop keeps messages whenever `removedTokens >= tokensToRemove`.

## [LOW] state-mutation — packages/agent-runtime/src/util/messages.ts:171 — Singleton replacement message reused across histories
- **Risk:** `replacementMessage` is a module-level mutable message object. Every placeholder insertion maps to the same object reference, so later mutation of one replacement message (tags, providerOptions, cache controls, or content) can affect other omitted-message placeholders in the same or future trimmed histories.
- **Fix:** Replace the singleton with a factory such as `makeReplacementMessage()` and create a fresh message object for each placeholder.
- **Evidence:** `const replacementMessage = userMessage(...)` is defined once, and `filteredMessages.map((m) => m === placeholder ? replacementMessage : m)` reuses that object.

## [LOW] error-handling — packages/agent-runtime/src/util/format-value.ts:2 — Error formatter can throw while building validation errors
- **Risk:** `formatValueForError` calls `JSON.stringify` without a try/catch. Values containing `bigint`, circular references, or throwing `toJSON` methods can throw while the runtime is already constructing a validation error, replacing an actionable tool/output validation message with an unexpected exception.
- **Fix:** Wrap stringification in a safe serializer that handles BigInt, cycles, and throwing `toJSON`; fall back to `String(value)` plus type information when serialization fails.
- **Evidence:** `const jsonStr = JSON.stringify(value, null, 2) ?? 'undefined'` is the first statement in the formatter; callers include tool validation and `set_output` error paths.

## [LOW] correctness — packages/agent-runtime/src/util/simplify-tool-results.ts:28 — `read_files` error entries are simplified into content omissions
- **Risk:** `simplifyReadFileResults` preserves only entries with `summary`; every other read-files entry is converted to `{ path, contentOmittedForLength: true }`. If an entry represents an error or other metadata-only result, the actual failure can be hidden as a successful-but-omitted file, misleading later pruning context and agents that inspect prior reads.
- **Fix:** Preserve entries with `errorMessage` and unknown non-content shapes verbatim; only omit `content` for entries that actually contain file content.
- **Evidence:** The mapper checks only `if ('summary' in entry) return entry`; otherwise it returns `path` plus `contentOmittedForLength` unconditionally.

## [LOW] dependency-hygiene — packages/agent-runtime/src/util/messages.ts:6 — Full lodash import for one deep-equality helper
- **Risk:** Importing `{ isEqual }` from `lodash` can pull the full CommonJS lodash package into bundled/runtime artifacts for a single equality check, increasing install/bundle surface and making tree-shaking dependent on build-tool behavior.
- **Fix:** Import the narrow helper (`lodash/isEqual`) or replace it with a small local comparison appropriate for tool-result content.
- **Evidence:** `messages.ts` imports `isEqual` from `'lodash'`, and uses it only to compare simplified tool content in the pruning path.

## [LOW] API/ABI contract breaks — packages/agent-runtime/src/util/agent-output.ts:88 — `all_messages` output silently drops the first message
- **Risk:** The `all_messages` output mode does not actually return all messages; it unconditionally slices off index 0 based on an internal assumption that the first message is previous conversation history. If callers construct an agent state without that synthetic prefix, or if future pruning/compaction changes the first entry, the first real agent message is lost from the public output contract.
- **Fix:** Make the history-prefix marker explicit (tagged message or metadata) and filter only that marker, or rename/document the mode as excluding the synthetic initial context.
- **Evidence:** For `outputMode === 'all_messages'`, the implementation does `agentState.messageHistory.slice(1).filter(...)` before returning `type: 'allMessages'`.

## [LOW] test-coverage — packages/agent-runtime/src/util/agent-output.ts:63 — Output shaping has no nearby unit test coverage
- **Risk:** `getAgentOutput` encodes externally visible output-mode contracts (`structured_output`, `last_message`, `all_messages`) and filtering of `TOOL_CALL_ERROR` messages, but there is no nearby `agent-output` unit test. Regressions such as dropping a real first message, leaking excluded tags, or mis-bounding the last assistant turn could ship unnoticed.
- **Fix:** Add `util/__tests__/agent-output.test.ts` covering all output modes, excluded-tag filtering, no-assistant fallback, consecutive assistant turns, and `all_messages` prefix handling.
- **Evidence:** The util test set includes context pruning, token counter, simplification, messages, validation formatting, cache debug, text tool-call parsing, and stream XML parsing, but no test file exercises `getAgentOutput`.
