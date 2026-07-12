# Runtime/state file-picker manifest

## Scope

Independent source map for the CLI message lifecycle: user submission, SDK run setup, streaming/event translation, cancellation, queue ownership, retry/timeout/error display, chat/session/history persistence, tool-progress rendering, and the CLI-to-SDK/runtime contracts beneath those flows. This is a file-selection artifact only; it contains no audit findings or feature recommendations.

The primary groups below are sized for later review at roughly 5–15 files and normally below ~3,000 source LOC. LOC figures are approximate `wc -l` totals and exclude the related tests/docs lists.

## Primary files by subshard

### RS-1 — Send lifecycle and run setup (~1,962 LOC; 9 files)

- `cli/src/hooks/use-send-message.ts`
- `cli/src/hooks/helpers/send-message.ts`
- `cli/src/utils/create-run-config.ts`
- `cli/src/utils/codebuff-client.ts`
- `cli/src/utils/send-message-helpers.ts`
- `cli/src/utils/send-message-timer.ts`
- `cli/src/types/contracts/send-message.ts`
- `cli/src/utils/yield-to-event-loop.ts`
- `cli/src/project-files.ts`

Key symbols/flow: `useSendMessage` -> provider/agent preparation -> `prepareUserMessage` -> `setupStreamingContext` -> `createEventHandlerState`/`createRunConfig` -> `OpenbuffClient.run`; run ownership, checkpoint resume, `AbortController`, completion/error cleanup, queue finalization, timer outcomes, current chat ID.

### RS-2 — Stream state and SDK-event translation (~1,865 LOC; 8 files)

- `cli/src/hooks/use-chat-streaming.ts`
- `cli/src/hooks/stream-state.ts`
- `cli/src/utils/sdk-event-handlers.ts`
- `cli/src/utils/stream-chunk-processor.ts`
- `cli/src/utils/create-event-handler-state.ts`
- `cli/src/utils/message-updater.ts`
- `cli/src/utils/tool-result-normalizer.ts`
- `common/src/types/print-mode.ts`

Key symbols/flow: `useChatStreaming`, `createStreamController`, `createEventHandler`, `createStreamChunkHandler`, root/subagent chunk routing, batched message mutation, event-to-block correlation, `tool_call`/`tool_start`/`tool_result`, phases, context-window/compaction, finish/cost, streaming-agent membership, and the discriminated `PrintModeEvent` contract.

### RS-3 — Queue, keyboard, submit, and cancellation controls (~2,872 LOC; 8 files)

- `cli/src/chat.tsx`
- `cli/src/hooks/use-message-queue.ts`
- `cli/src/hooks/use-queue-controls.ts`
- `cli/src/hooks/use-queue-ui.ts`
- `cli/src/hooks/use-chat-input.ts`
- `cli/src/hooks/use-chat-keyboard.ts`
- `cli/src/hooks/use-exit-handler.ts`
- `cli/src/utils/chat-input-key-intercept.ts`

Key symbols/flow: `Chat` composition root; `useMessageQueue`, processing-owner symbols and 60s watchdog; queue pause/resume/clear; stream status gates; submit-vs-enqueue decisions; Escape/Ctrl-C handling; exit confirmation; input interception while overlays or tool interactions are active.

### RS-4 — Chat store, history, checkpoints, and persisted run state (~2,246 LOC; 10 files)

- `cli/src/hooks/use-chat-state.ts`
- `cli/src/hooks/use-chat-messages.ts`
- `cli/src/state/chat-store.ts`
- `cli/src/state/chat-history-store.ts`
- `cli/src/state/message-block-store.ts`
- `cli/src/utils/message-history.ts`
- `cli/src/utils/chat-history.ts`
- `cli/src/utils/run-state-storage.ts`
- `cli/src/types/chat.ts`
- `cli/src/types/chat-state.ts`

Key symbols/flow: Zustand/Immer `useChatStore`; message snapshots/undo/redo; UI refs versus store state; batched/visible message loading; prompt history; per-chat directory discovery/deletion; `run-state.json`, `chat-messages.json`, `turn-checkpoint.json`; reload/continue-chat restoration; `ChatMessage`/content-block shape.

### RS-5 — CLI resilience and user-facing status/error state (~1,481 LOC; 7 files)

- `cli/src/hooks/use-connection-status.ts`
- `cli/src/hooks/use-timeout.ts`
- `cli/src/utils/error-handling.ts`
- `cli/src/utils/error-messages.ts`
- `cli/src/utils/format-timeout.ts`
- `cli/src/utils/openbuff-provider.ts`
- `cli/src/utils/validation-error-helpers.ts`

Key symbols/flow: online/offline connection observation, named timer registry/cleanup, SDK error sanitization/status extraction, retry-banner formatting, provider readiness/discovery errors before a run starts, network validation IDs, and timeout text presented by the CLI.

### RS-6 — Tool/subagent progress rendering (~2,450 LOC; 11 files)

- `cli/src/components/message-block.tsx`
- `cli/src/components/message-with-agents.tsx`
- `cli/src/components/blocks/tool-branch.tsx`
- `cli/src/components/blocks/tool-block-group.tsx`
- `cli/src/components/tools/registry.ts`
- `cli/src/components/tools/types.ts`
- `cli/src/components/tools/tool-call-item.tsx`
- `cli/src/components/status-bar.tsx`
- `cli/src/utils/status-indicator-state.ts`
- `cli/src/components/progress-bar.tsx`
- `cli/src/components/message-footer.tsx`

Key symbols/flow: streaming/completed message presentation, agent child grids, queued/pending/active tool state, renderer registry and fallback disposition, elapsed/cost/context status, auth/retry/unreachable/queue status derivation, completion footer, and progress visualization.

### RS-7 — SDK run/session contract (~2,690 LOC; 5 files)

- `sdk/src/client.ts`
- `sdk/src/run.ts`
- `sdk/src/run-state.ts`
- `common/src/types/session-state.ts`
- `common/src/types/messages/codebuff-message.ts`

Key symbols/flow: `OpenbuffClient.run`; `RunOptions`/`OpenbuffClientOptions`; `handleEvent`; `previousRun`; composed user and timeout abort signals; cancellation-state reconstruction; filesystem mutation callbacks; `RunState`; initial/restored `SessionState`; and `mainAgentState.messageHistory`.

This group is close to the ~3k ceiling. Do not add more source files without splitting it.

### RS-8 — Provider streaming, retry, timeout, and abort classification (~2,424 LOC; 4 files)

- `sdk/src/impl/llm.ts`
- `sdk/src/retry-config.ts`
- `common/src/types/contracts/llm.ts`
- `common/src/util/error.ts`

Key symbols/flow: `promptAiSdkStream`, transient-network and HTTP retry classification, no-retry-after-yield rule, exponential backoff/jitter, abort-aware delay, OAuth refresh/failover paths, post-stream metadata timeout, provider stream chunk contract, and shared abort/error utilities.

This is intentionally a 4-file group because `llm.ts` and `error.ts` are large; adding a fifth substantial source would push it toward the pruning threshold.

### RS-9 — Agent-runtime stream/event production (~2,993 LOC; 5 files)

- `packages/agent-runtime/src/run-agent-step.ts`
- `packages/agent-runtime/src/main-prompt.ts`
- `packages/agent-runtime/src/prompt-agent-stream.ts`
- `packages/agent-runtime/src/tool-stream-parser.ts`
- `packages/agent-runtime/src/tools/stream-parser.ts`

Key symbols/flow: `runAgentStep`/`loopAgentSteps`; prompt stream consumption; response chunk callbacks; text/reasoning/tool-call parsing; parallel tool ordering; abort propagation; subagent and phase events; runtime errors translated into `PrintModeEvent` payloads.

This group is effectively at the ~3k ceiling. Review it as listed; if tests or `tools/tool-executor.ts` are promoted into primary scope, split the group first.

### RS-10 — Source entry and workspace SDK resolution (~1,715 LOC; 9 files)

- `cli/src/index.tsx`
- `cli/tsconfig.json`
- `cli/package.json`
- `sdk/package.json`
- `sdk/src/index.ts`
- `sdk/src/tools/index.ts`
- `sdk/src/tools/find-files-matching-content.ts`
- `package.json`
- `bunfig.toml`

Key symbols/flow: CLI source entry/import graph, `@openbuff/sdk` workspace mapping to `sdk/src/index.ts`, SDK barrel exports, eager parsing of tool modules, package export conditions, and root workspace scripts.

Baseline contract evidence supplied by the parent audit: `bun run cli/src/index.tsx --help` currently fails to parse `sdk/src/tools/find-files-matching-content.ts:473` (`continue` outside a loop), while the already-built `cli/bin/openbuff --help` succeeds. The source file and resolution chain above must be reviewed together; the packaged binary itself is excluded as generated output.

### RS-11 — Binary/package build and smoke path (~1,955 LOC including workflow YAML; 6 files)

- `cli/scripts/build-binary.ts`
- `cli/scripts/smoke-binary.ts`
- `cli/src/pre-init/tree-sitter-wasm.ts`
- `cli/src/native/ripgrep.ts`
- `sdk/scripts/build.ts`
- `.github/workflows/cli-release-build.yml`

Key symbols/flow: SDK prebuild before CLI compilation, source entry chosen for `bun build --compile`, production conditions/defines, embedded tree-sitter and ripgrep assets, binary startup smoke checks, and release-job invocation of the same build script.

## Related tests

### Send/setup tests

- `cli/src/hooks/helpers/__tests__/send-message.test.ts` (1,745 LOC)
- `cli/src/utils/__tests__/send-message-helpers.test.ts` (1,762 LOC)
- `cli/src/utils/__tests__/send-message-timer.test.ts`
- `cli/src/hooks/__tests__/use-send-message-timer.test.ts`
- `cli/src/__tests__/helpers/mock-api-client.ts`

Do not place the two 1.7k test files in one audit group: together they exceed ~3.5k LOC before implementation files.

### Stream/event and rendering tests

- `cli/src/utils/__tests__/sdk-event-handlers.test.ts`
- `cli/src/utils/__tests__/message-updater.test.ts`
- `cli/src/components/__tests__/message-block.streaming.test.tsx`
- `cli/src/components/__tests__/message-block.completion.test.tsx`
- `cli/src/components/__tests__/message-with-agents.test.tsx`
- `cli/src/components/__tests__/status-indicator.test.tsx`
- `cli/src/components/tools/__tests__/registry-metadata.test.ts`

### Queue/input/cancellation tests

- `cli/src/hooks/__tests__/use-queue-controls.test.ts`
- `cli/src/hooks/__tests__/use-chat-input.test.ts`
- `cli/src/utils/__tests__/chat-input-key-intercept.test.ts`
- `cli/src/hooks/__tests__/use-connection-status.test.ts`
- `cli/src/hooks/__tests__/use-timeout.test.ts`
- `cli/src/utils/__tests__/osc-timeout-scenarios.test.ts`

### History/persistence tests

- `cli/src/utils/__tests__/chat-history.test.ts`
- `cli/src/utils/__tests__/run-state-storage.test.ts`
- `cli/src/utils/__tests__/turn-checkpoint.test.ts`
- `cli/src/hooks/__tests__/use-input-history.test.ts`
- `cli/src/components/__tests__/prompt-history-search-screen.test.ts`

### SDK/runtime contract tests

- `sdk/src/__tests__/run-cancellation.test.ts` (1,394 LOC)
- `sdk/src/__tests__/run-error-preserves-history.test.ts`
- `sdk/src/__tests__/run-handle-event.test.ts`
- `sdk/src/__tests__/retry-config.test.ts`
- `sdk/src/impl/__tests__/failover-integration.test.ts`
- `sdk/src/impl/__tests__/llm-chatgpt-oauth-policy.test.ts`
- `packages/agent-runtime/src/__tests__/loop-agent-steps-abort.test.ts`
- `packages/agent-runtime/src/__tests__/subagent-streaming.test.ts`
- `packages/agent-runtime/src/__tests__/subagent-timeout.test.ts`
- `packages/agent-runtime/src/__tests__/spawn-agents-message-history.test.ts`
- `packages/agent-runtime/src/__tests__/stream-parser-abort.test.ts`
- `packages/agent-runtime/src/__tests__/stream-parser-parallelism.test.ts`
- `packages/agent-runtime/src/__tests__/stream-parser-reasoning.test.ts`

### SDK e2e event/continuation tests

- `sdk/e2e/utils/event-collector.ts`
- `sdk/e2e/utils/__tests__/event-collector.test.ts`
- `sdk/e2e/integration/event-ordering.integration.test.ts`
- `sdk/e2e/integration/event-types.integration.test.ts`
- `sdk/e2e/integration/stream-chunks.integration.test.ts`
- `sdk/e2e/streaming/concurrent-streams.e2e.test.ts`
- `sdk/e2e/streaming/subagent-streaming.e2e.test.ts`
- `sdk/e2e/workflows/error-recovery.e2e.test.ts`
- `sdk/e2e/workflows/multi-turn-conversation.e2e.test.ts`

### Source/binary contract tests

- `cli/src/__tests__/cli-args.test.ts`
- `cli/src/__tests__/release-wrapper.test.ts`
- `cli/src/__tests__/release/proxy-http-get.test.ts`
- `sdk/src/__tests__/find-files-matching-content.test.ts`
- `sdk/smoke-test-dist.ts`
- `sdk/scripts/verify.ts`
- `sdk/test/esm-compatibility/test-imports.js`
- `sdk/test/cjs-compatibility/test-imports.js`
- `sdk/test/ripgrep-bundling/test-ripgrep.js`

## Related docs

- `docs/request-flow.md` — authoritative CLI -> SDK -> runtime -> provider lifecycle, streaming, state, and cancellation narrative.
- `docs/architecture.md` — package boundaries, `client.run()`, `handleSteps`, and stream routing.
- `docs/testing.md` — DI-over-mocking and tmux CLI validation expectations.
- `docs/development.md` — workspace/Bun development and binary workflow context.
- `docs/agents-and-tools.md` — tool/subagent lifecycle, step caps, and completion/gate behavior.
- `docs/local-mode.md` — BYOK/local provider routing assumptions used by run readiness and error handling.
- `docs/environment-variables.md` — process/env loading contract across CLI and SDK.

## Explicit exclusions

- `node_modules/**`, cache directories, coverage output, SDK `dist/**`, compiled assets, source maps, and generated bundles.
- `cli/bin/openbuff` and other compiled binaries: behavior may be smoke-tested, but the binary is generated and must not be source-audited.
- Generated agent/type-source files such as `cli/src/agents/bundled-agents.generated.*` and `cli/src/data/initial-agent-type-sources.generated.ts`.
- Existing audit findings, reports, and manifests under `.agents/sessions/**` other than the pinned structural `MAP.md`; this picker was independent of current audits.
- Individual tool-specific renderer implementations (`components/tools/read-files.tsx`, `apply-patch.tsx`, etc.) except the shared registry/types/fallback/progress surface listed in RS-6.
- Provider/model picker UX, OAuth setup screens, analytics/feedback/publishing, indexing internals, command palette/slash-command feature breadth, and terminal layout/theme concerns except where directly imported by the scoped lifecycle files.
- Agent prompt quality and tool semantics beyond the runtime event/state contract. `packages/agent-runtime/src/tools/tool-executor.ts` is adjacent but intentionally not primary in RS-9 because adding it would push that group well over ~4k LOC; assign it to a dedicated tool-execution shard if required.
