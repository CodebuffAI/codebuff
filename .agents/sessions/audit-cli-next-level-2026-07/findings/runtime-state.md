# Runtime/state CLI audit findings

## [HIGH] Correctness — cli/src/hooks/helpers/send-message.ts:353 — cancellation can fork UI history from SDK history

- **Risk:** Escape immediately unlocks a new send while the cancelled SDK run is still producing its authoritative preserved session state, so the next prompt can start from stale `previousRunStateRef` and permanently omit the cancelled turn's prompt, partial work, tool results, and interruption marker from model context.
- **Fix:** Add an explicit `cancelling` state and either await the cancelled run's `RunState` before admitting the next send or merge that state into a per-run continuation chain before a newer run captures `previousRun`.
- **Evidence:** `setupStreamingContext` releases `updateChainInProgress(false)` and `setCanProcessQueue(...)` at lines 353-375 and explicitly accepts stale continuation state at lines 355-360; `use-send-message.ts:581-592` then discards every aborted completion instead of updating `previousRunStateRef`, while `sdk/src/__tests__/run-cancellation.test.ts:945-1107` proves the SDK's cancelled result preserves history specifically so it can be passed as the next run's `previousRun`.
- **Confidence:** High.
- **Basis:** Evidence.

## [HIGH] API/ABI contract breaks — sdk/src/run.ts:719 — promised async event handlers are dispatched fire-and-forget

- **Risk:** SDK consumers can receive reordered events or see `client.run()` resolve before their async `handleEvent`/`handleStreamChunk` side effects finish, despite the public types promising `Promise<void>` support.
- **Fix:** Serialize response callbacks through an awaited event queue and drain it before returning the terminal `RunState`, or change `SendActionFn` to return a promise and await it throughout the runtime.
- **Evidence:** `OpenbuffClientOptions` declares both callbacks as `void | Promise<void>` at `sdk/src/run.ts:152-168`, and `onResponseChunk` awaits them at lines 530-570, but `sendAction` calls `onResponseChunk(action)` and `onSubagentResponseChunk(action)` without awaiting at lines 719-725; `common/src/types/contracts/client.ts:63` fixes `SendActionFn` to a synchronous `void`, and the ordering tests use a synchronous collector (`sdk/e2e/utils/event-collector.ts:27-38`) so they do not exercise the advertised async ABI.
- **Confidence:** High.
- **Basis:** Evidence.

## [MEDIUM] Security — cli/src/utils/run-state-storage.ts:127 — `--continue` accepts traversal outside the chat directory

- **Risk:** A crafted conversation id such as `../../../some-dir` makes the CLI read `run-state.json` and `chat-messages.json` outside the project chat store, allowing unintended local-file ingestion into the UI and subsequent agent context.
- **Fix:** Require a single basename chat id and verify `path.relative(chatsDir, candidateDir)` remains contained before any stat/read, reusing the validation already applied by deletion.
- **Evidence:** `cli/src/index.tsx:121-160` accepts an arbitrary optional `--continue [conversation-id]`; `use-send-message.ts:153-161` passes it directly to `loadMostRecentChatState`; that function uses `path.join(baseDir, chatId.trim())` at lines 127-134 without containment validation, while `deleteChatSession` correctly rejects `.`, `..`, and non-basename ids at `cli/src/utils/chat-history.ts:129-139`.
- **Confidence:** High.
- **Basis:** Evidence.

## [MEDIUM] State mutation — cli/src/utils/run-state-storage.ts:93 — completed chat persistence is not crash-atomic

- **Risk:** A crash, disk-full error, or interruption between the two direct writes can leave a truncated file or a `run-state.json`/`chat-messages.json` pair from different turns, after which restore rejects the whole session and silently falls back.
- **Fix:** Persist one versioned envelope atomically, or write both versioned temp files plus a commit manifest and rename only after every write/fsync succeeds.
- **Evidence:** `saveChatState` writes the two live files sequentially with `writeFileSync` at lines 93-105; `loadMostRecentChatState` requires and parses both together at lines 152-193 and returns `null` on any failure; the same module already implements temp-file plus same-directory rename for checkpoints at lines 216-256, demonstrating the safer local pattern, while `run-state-storage.test.ts:266-338` only tests manual serialization shape rather than interrupted saves.
- **Confidence:** High.
- **Basis:** Evidence.

## [MEDIUM] Correctness — cli/src/hooks/use-message-queue.ts:294 — rejected queued sends are irreversibly dropped

- **Risk:** The queue removes its head before `sendMessage` is accepted, and any rejection is only logged, so initialization races or future preflight failures can erase a user's queued prompt and attachments without a retry affordance.
- **Fix:** Keep an explicit in-flight queue item until send acceptance, and on rejection either requeue it with retry metadata or restore it to the input while showing a visible actionable error.
- **Evidence:** `processNextMessage` slices the item out at lines 294-302 before calling `completeQueuedMessageProcessing`; the rejection handler at lines 121-127 only calls `logger.warn`; `use-chat-streaming.ts:154-170` explicitly rejects when the send ref is missing and logs that the message was dropped, but `use-queue-controls.test.ts:56-249` covers ownership/watchdogs and has no rejected-send preservation assertion.
- **Confidence:** High.
- **Basis:** Evidence.

## [MEDIUM] Correctness — cli/src/hooks/use-connection-status.ts:6 — resilience indicators are disconnected from provider reality

- **Risk:** Users cannot distinguish DNS loss, provider unreachability, rate-limit backoff, or failover from ordinary thinking because the CLI always reports connected and never sets retry state true, making queue/recovery behavior opaque during the moments trust matters most.
- **Fix:** Add structured `provider_attempt`, `retry_scheduled`, `failover`, and `provider_recovered` events carrying model/provider, attempt, delay, and status; derive connection and retry UI from those events rather than a constant hook.
- **Evidence:** `useConnectionStatus` returns `true` unconditionally at lines 6-10 and its tests require that behavior; `cli/src/app.tsx:220` hard-codes `authStatus = 'ok'`; retry logic in `sdk/src/impl/llm.ts:1280-1318` only logs attempts; the event union in `common/src/types/print-mode.ts:189-205` has no retry/failover event; CLI code only calls `setIsRetrying(false)` (`use-send-message.ts:301,597`, `sdk-event-handlers.ts:145-150`), while `formatRetryBannerMessage` is defined but unused.
- **Confidence:** High.
- **Basis:** Evidence.

## [MEDIUM] Error handling — packages/agent-runtime/src/run-agent-step.ts:1574 — internal stacks can reach the user-facing error banner

- **Risk:** Local paths, implementation frames, and provider/library internals can be exposed in the TUI and persisted chat history, and raw technical output makes errors less trustworthy and actionable.
- **Fix:** Preserve structured diagnostics only in redacted logs, and return a stable public error code, safe summary, provider/status metadata, and optional recovery action to the CLI.
- **Evidence:** The runtime appends `error.stack` when no structured server status is available at lines 1574-1583 and returns it in `output.message` at lines 1602-1609; the CLI deliberately passes that raw message into `UserErrorBanner` at `cli/src/hooks/helpers/send-message.ts:450-453`; `sdk/src/error-utils.ts:107-124` claims to sanitize but simply returns the original message, while `cli/src/utils/__tests__/error-handling.test.ts:38-47` asserts stacks must not reach user-facing messages on a different helper path.
- **Confidence:** High.
- **Basis:** Evidence.

## [MEDIUM] Error handling — cli/src/utils/sdk-event-handlers.ts:745 — declared runtime error events are silently ignored

- **Risk:** Parser/tool/runtime errors emitted during an otherwise continuing run disappear from the TUI, leaving users watching an apparently stuck agent without the warning the SDK explicitly delivered.
- **Fix:** Handle `PrintModeEvent.type === 'error'` as a non-destructive activity/error block with correlation metadata, and distinguish recoverable stream warnings from terminal run errors.
- **Evidence:** `printModeErrorSchema` is part of the public discriminated union at `common/src/types/print-mode.ts:12-16,189-205`; the SDK forwards action errors through `handleEvent({ type: 'error' ... })` at `sdk/src/run.ts:478-481`; `createEventHandler` matches tool/subagent/finish/phase/context events but falls through to `.otherwise(() => undefined)` at `cli/src/utils/sdk-event-handlers.ts:745-759`, and `sdk-event-handlers.test.ts` has no error-event assertion.
- **Confidence:** High.
- **Basis:** Evidence.

## [MEDIUM] Performance — cli/src/utils/chat-history.ts:48 — chat history search blocks the TUI on synchronous full-file reads

- **Risk:** Opening history with hundreds of long chats can freeze keyboard/render responsiveness while up to 500 JSON files are synchronously statted, read, and parsed on the main event loop.
- **Fix:** Maintain a small atomic per-chat metadata index and load pages asynchronously, moving legacy index reconstruction to a worker or bounded async concurrency.
- **Evidence:** `getAllChats` synchronously enumerates and stats every directory at lines 48-78, then synchronously reads/parses as many as 500 complete message files at lines 80-114; `chat-history-screen.tsx:51-60` calls it during initial state construction and again in `setTimeout(0)`, which defers work but does not move it off the UI thread.
- **Confidence:** High.
- **Basis:** Evidence.

## [LOW] Dependency hygiene — cli/src/utils/send-message-helpers.ts:7 — CLI imports undeclared `lodash`

- **Risk:** Isolated CLI installs/builds depend on the root workspace's hoisted development dependency, so a packaging or workspace-layout change can turn a working source tree into a missing-module startup failure.
- **Fix:** Declare `lodash` in `cli/package.json` or replace the small `has`/`isEqual` uses with local/native helpers and remove the transitive reliance.
- **Evidence:** `send-message-helpers.ts:7`, `message-block-helpers.ts:1`, and `sdk-event-handlers.ts:1` import `lodash`; `cli/package.json` does not declare it, while only root `package.json:64` declares `lodash` under `devDependencies` and the binary workflow installs with `bun install --frozen-lockfile --cwd cli` at `.github/workflows/cli-release-build.yml:84-85`.
- **Confidence:** High.
- **Basis:** Evidence.

## [LOW] Correctness — cli/src/components/message-footer.tsx:221 — per-turn cost uses an ambiguous unit

- **Risk:** A turn costing three cents is rendered as `cost 3` while the session status renders cents as dollars, so users can misread spend by roughly two orders of magnitude.
- **Fix:** Rename the legacy `credits` field to `costCents` at the UI boundary and format it with the same currency helper as the session total.
- **Evidence:** Runtime accounting explicitly stores provider cost in cents (`packages/agent-runtime/src/run-agent-step.ts:1251` and `cli/src/chat.tsx:389-391`); the status bar divides by 100 and prefixes `$` at `cli/src/components/status-bar.tsx:192-201`; the message footer prints the raw number as `cost ${cost}` at `message-footer.tsx:221-235`, and `message-block.completion.test.tsx:54-65` locks in `cost 3`.
- **Confidence:** High.
- **Basis:** Evidence.

## [MEDIUM] Test coverage gaps — cli/src/hooks/helpers/**tests**/send-message.test.ts:961 — recovery tests simulate state that production never applies

- **Risk:** The suite can pass while cancellation continuation loses history, async SDK callbacks escape ordering, queue rejection drops messages, and chat persistence tears, because current tests assert helper-local mechanics rather than the end-to-end ownership and failure boundaries.
- **Fix:** Add integration tests for abort-A/send-B with a deferred real `client.run`, rejected queued-send restoration, async callback ordering/drain-before-return, traversal rejection, and injected mid-write persistence failure/recovery.
- **Evidence:** The cancellation race description at lines 961-970 says B is blocked until A resolves, but the current test at lines 992 onward asserts B proceeds immediately; the later test manually assigns `previousRunState = runStateA` at lines 1380-1394 after run B is already set up, bypassing the production guard at `use-send-message.ts:581-592`; event-ordering uses synchronous handlers, queue tests omit rejection preservation, and run-state tests manually serialize files rather than exercising `saveChatState` failures.
- **Confidence:** High.
- **Basis:** Evidence.

## Strengths observed

- Streaming UI updates are deliberately batched at 100 ms and flushed before completion/error (`cli/src/utils/message-updater.ts:123-252`), balancing responsiveness with render pressure while preserving partial content.
- Tool and agent progress contracts are substantially richer than a basic spinner: queued/running/succeeded/failed/cancelled tool lifecycle, `tool_start`, subagent correlation, phase, context-window, and context-compaction events are represented and rendered (`common/src/types/print-mode.ts`, `cli/src/utils/sdk-event-handlers.ts`).
- The runtime's retry loop uses bounded exponential backoff with jitter, does not retry after content has been yielded, and is abort-aware; focused retry/abort tests passed.
- Runtime cancellation now propagates a shared signal, blocks new tools, waits for cooperative cleanup, stops browser sessions, and cleans owned temporary clone directories before returning (`sdk/src/run.ts:858-874`).
- Mid-turn checkpoints use same-directory temp writes and rename, include a turn id, reject malformed/stale snapshots, and provide a credible base for a first-class resume/retry UX.
- Persistence sanitization and mandatory sensitive-file filtering are present, and tool renderers have an exhaustive metadata disposition with a safe generic fallback.
- Status and completion surfaces already expose elapsed time, context use, model, git diff stats, cost, cache hit rate, queue preview, failed agents, and a visible Escape stop action.
- Release builds compile the source entry and run both synchronous and long-lived binary smoke checks, including embedded tree-sitter initialization.

## Verification notes

- The manifest's earlier source parse failure at `sdk/src/tools/find-files-matching-content.ts:473` is no longer present: the line now contains a valid conditional, `bun run cli/src/index.tsx --help` exits 0, and the diff shows the invalid control flow was repaired in the dirty worktree.
- The manifest's earlier CLI typecheck parse failure at `packages/agent-runtime/src/tools/handlers/tool/spawn-agents.ts:243` is also no longer present: that line now closes a report object, and `bun run --cwd cli typecheck` exits 0.
- The existing built binary still exits 0 for `cli/bin/openbuff --help`.
- Focused validation ran 90 tests across queue, persistence/checkpoint, connection, event translation, SDK cancellation/error history/retry/event handling, and runtime abort parsing: 82 passed; 8 checkpoint tests failed only because they attempt to write `/home/ben/.config/openbuff/...` in this restricted audit sandbox rather than an injected temp directory. This itself indicates test-environment coupling, but it was not treated as a product failure.

## Coverage / files actually read

- Docs: `docs/request-flow.md`, `docs/architecture.md`, `docs/testing.md`, `docs/development.md`, `docs/agents-and-tools.md`, `docs/local-mode.md`, `docs/environment-variables.md`.
- Send/run setup: `cli/src/hooks/use-send-message.ts`, `cli/src/hooks/helpers/send-message.ts`, `cli/src/utils/create-run-config.ts`, `cli/src/utils/codebuff-client.ts`, `cli/src/utils/send-message-helpers.ts`, `cli/src/utils/send-message-timer.ts`, `cli/src/types/contracts/send-message.ts`, `cli/src/utils/yield-to-event-loop.ts`, `cli/src/project-files.ts`.
- Streaming/events: `cli/src/hooks/use-chat-streaming.ts`, `cli/src/hooks/stream-state.ts`, `cli/src/utils/sdk-event-handlers.ts`, `cli/src/utils/stream-chunk-processor.ts`, `cli/src/utils/create-event-handler-state.ts`, `cli/src/utils/message-updater.ts`, `cli/src/utils/tool-result-normalizer.ts`, `common/src/types/print-mode.ts`.
- Queue/input/cancellation: `cli/src/chat.tsx`, `cli/src/hooks/use-message-queue.ts`, `cli/src/hooks/use-queue-controls.ts`, `cli/src/hooks/use-queue-ui.ts`, `cli/src/hooks/use-chat-input.ts`, `cli/src/hooks/use-chat-keyboard.ts`, `cli/src/hooks/use-exit-handler.ts`, `cli/src/utils/chat-input-key-intercept.ts`, plus the adjacent prompt router needed to verify submit-vs-enqueue behavior.
- History/state: `cli/src/hooks/use-chat-state.ts`, `cli/src/hooks/use-chat-messages.ts`, `cli/src/state/chat-store.ts`, `cli/src/state/chat-history-store.ts`, `cli/src/state/message-block-store.ts`, `cli/src/utils/message-history.ts`, `cli/src/utils/chat-history.ts`, `cli/src/utils/run-state-storage.ts`, `cli/src/types/chat.ts`, `cli/src/types/chat-state.ts`.
- Resilience/status: `cli/src/hooks/use-connection-status.ts`, `cli/src/hooks/use-timeout.ts`, `cli/src/utils/error-handling.ts`, `cli/src/utils/error-messages.ts`, `cli/src/utils/format-timeout.ts`, `cli/src/utils/openbuff-provider.ts`, `cli/src/utils/validation-error-helpers.ts`, `cli/src/utils/status-indicator-state.ts`.
- Rendering/progress: `cli/src/components/message-block.tsx`, `cli/src/components/message-with-agents.tsx`, `cli/src/components/blocks/tool-branch.tsx`, `cli/src/components/blocks/tool-block-group.tsx`, `cli/src/components/tools/registry.ts`, `cli/src/components/tools/types.ts`, `cli/src/components/tools/tool-call-item.tsx`, `cli/src/components/status-bar.tsx`, `cli/src/components/progress-bar.tsx`, `cli/src/components/message-footer.tsx`.
- SDK/runtime: `sdk/src/client.ts`, `sdk/src/run.ts`, `sdk/src/run-state.ts`, `sdk/src/impl/llm.ts`, `sdk/src/retry-config.ts`, `sdk/src/error-utils.ts`, `common/src/types/session-state.ts`, `common/src/types/messages/codebuff-message.ts`, `common/src/types/contracts/llm.ts`, `common/src/util/error.ts`, `packages/agent-runtime/src/run-agent-step.ts`, `packages/agent-runtime/src/main-prompt.ts`, `packages/agent-runtime/src/prompt-agent-stream.ts`, `packages/agent-runtime/src/tool-stream-parser.ts`, `packages/agent-runtime/src/tools/stream-parser.ts`, and the explicitly requested `packages/agent-runtime/src/tools/handlers/tool/spawn-agents.ts` verification target.
- Source/build contract: `cli/src/index.tsx`, `cli/tsconfig.json`, `cli/package.json`, `sdk/package.json`, `sdk/src/index.ts`, `sdk/src/tools/index.ts`, `sdk/src/tools/find-files-matching-content.ts`, root `package.json`, `bunfig.toml`, `cli/scripts/build-binary.ts`, `cli/scripts/smoke-binary.ts`, `cli/src/pre-init/tree-sitter-wasm.ts`, `cli/src/native/ripgrep.ts`, `sdk/scripts/build.ts`, `.github/workflows/cli-release-build.yml`.
- Tests read or executed include the manifest's queue, send lifecycle, event translation, connection/timeout, history/checkpoint, SDK cancellation/error/retry/event, runtime abort/stream parser, event collector/order, rendering completion, and source/binary contract groups. Existing `.agents/sessions/**` audit findings/reports were not read.
