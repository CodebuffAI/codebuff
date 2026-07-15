# Request Flow: CLI → Local SDK → User-Configured Provider

This document traces the path a user prompt takes through Openbuff. Openbuff
is local-first and BYOK: there is no hosted backend, credit ledger, or
server-side proxy in the primary flow. The CLI/TUI talks to the SDK, the SDK
drives the agent runtime, and the agent runtime calls a user-configured
provider directly. Tool execution happens locally on the user's machine.

See [Local Mode](./local-mode.md) for provider configuration and
[Architecture](./architecture.md) for the package layout.

## Overview

```
┌─────────┐    ┌─────────┐    ┌────────────────┐    ┌──────────────────────────┐
│ CLI/TUI │───▶│   SDK   │───▶│ Agent Runtime  │───▶│ User-Configured Provider │
│         │◀───│ run.ts  │◀───│ loopAgentSteps │◀───│ (OpenAI / Anthropic /    │
│         │    │         │    │                │    │  OpenRouter / Ollama …)  │
└────┬────┘    └─────────┘    └────────────────┘    └──────────────────────────┘
     │                                  ▲
     │                                  │
     └── local tool execution ──────────┘
         (read_files, str_replace, run_terminal_command, …)
```

Everything in the diagram runs on the user's machine. Provider HTTP calls go
from the local process directly to the provider URL configured in
`openbuff.json` (no `codebuff.json` fallback is read). No request is proxied
through a hosted Openbuff/Codebuff service in this primary flow.

## Step-by-Step Flow

### 1. CLI/TUI: User Input

**Files:** `cli/src/hooks/use-send-message.ts`,
`cli/src/hooks/helpers/send-message.ts`

1. User types a prompt and hits Enter.
2. `prepareUserMessage()` collects pending bash context, attachments, and
   creates the user message in the chat UI.
3. `setupStreamingContext()` wires up an `AbortController` (Escape cancels),
   an elapsed-time timer, and a batched UI updater.
4. The CLI calls `client.run()` from the SDK.

### 2. SDK: Local Orchestration

**File:** `sdk/src/run.ts`

1. `run()` → `runOnce()` is called with the prompt, agent ID, cost mode, and
   session state.
2. When `cwd` is present and the host did not inject a custom filesystem, the
   SDK initializes the worktree's cooperative mutation broker in the local
   harness state directory. It serializes participating Openbuff processes,
   checks exact-byte hashes under the lock, writes durable receipts, and uses
   crash-safe replacement/no-clobber primitives. If broker locking or durable
   state is unavailable, guarded mutations fail closed. Arbitrary external
   editors are not excluded by this broker.
3. **Session state** is initialized fresh or restored from `previousRun`.
4. **Provider routing** is resolved from `openbuff.json` (`defaultModel`,
   `modes`, `agents`, and provider entries). No `codebuff.json` fallback is
   read. Openbuff does not consult a hosted model registry.
5. **Local tool handlers** are registered. These execute on the user's
   machine, never on a server:
   - `write_file`, `str_replace`, `edit_transaction`, `apply_patch` → active
     file edits (`apply_smart_patch` remains registered only as a quarantined
     compatibility surface until its authority migration is complete)
   - `run_terminal_command` → shell commands
   - `code_search`, `find_files_matching_content`, `glob`, `list_directory`
     → file search
   - `read_files`, `read_outline`, `read_subtree` → active file reading
     (`read_slices` remains registered only as a quarantined compatibility
     alias for persisted/external calls; new prompts use `read_files.symbols`)
   - `create_plan`, `update_plan_status` → plan artifact authoring
   - `inspect_workspace`, `get_task`, `get_change_review_bundle` → snapshot-bound workspace/task/review evidence
   - `inspect_environment`, `get_affected_tests`, `get_build_targets` → read-only toolchain and validation-target intelligence
   - `inspect_codebase_structure`, `inspect_feature_completeness`, `evaluate_audit_coverage` → snapshot-bound broad-audit inventory and completeness gating
   - `run_targeted_validation` → snapshot-checked scoped validation
   - Custom tool definitions and MCP tools
6. **Action handlers** stream provider output back to the CLI:
   - `response-chunk` → streams text to the CLI
   - `subagent-response-chunk` → streams subagent output
   - `prompt-response` → final result (resolves the promise)
   - `prompt-error` → error result
7. `callMainPrompt()` is invoked (fire-and-forget, with a `.catch()`
   handler).

### 3. Agent Runtime: Main Prompt

**File:** `packages/agent-runtime/src/main-prompt.ts`

1. Assembles local agent templates from the project's `.agents/` directory
   and the shipped `agents/` package.
2. Sends a `response-chunk` `start` event to the CLI.
3. `mainPrompt()` selects the agent based on cost mode (`lite` → `base-free`,
   `normal` → `base`, `ask` → `ask`, `max` → `base2`, `experimental` →
   `base2`, default → `base2`) or an explicit custom agent ID.
4. Calls `loopAgentSteps()` with the agent template, prompt, and session
   state.

### 4. Agent Runtime: Agent Loop

**File:** `packages/agent-runtime/src/run-agent-step.ts`

1. `loopAgentSteps()` builds the system prompt, tool definitions, and
   initial messages.
2. Enters the main loop:
   ```
   while (true) {
     // 1. Run programmatic step (if agent has handleSteps)
     // 2. Check if turn should end
     // 3. Call runAgentStep() for LLM inference
     // 4. Process tool calls and responses
   }
   ```
3. Each `runAgentStep()` call:
   - Counts context tokens locally.
   - Calls `getAgentStreamFromTemplate()` → `promptAiSdkStream()`.
   - `processStream()` iterates over the AI SDK stream, handling text chunks
     and tool calls.
   - Tool calls are dispatched back to the SDK via `requestToolCall`,
     executed locally, and their results fed into the next step.
4. The loop continues until the agent stops emitting tool calls or calls
   `end_turn` / `task_completed`.
5. Sends a `response-chunk` `finish` event, then a `prompt-response` action
   with the final session state and output.

### 5. Provider Call: BYOK Routing

**Files:** `sdk/src/impl/llm.ts`, `sdk/src/impl/model-provider.ts`,
`sdk/src/provider-config.ts`

`promptAiSdkStream()` routes each request to a user-configured provider
based on `openbuff.json`:

- **OpenAI-compatible** (`openai-compatible`) — OpenAI, OpenRouter, GLM,
  Ollama, vLLM, llama.cpp, and similar endpoints reached using the user's
  API key. Per-provider `compatibility` flags strip cache-control, downgrade
  unsupported `tool_choice`, or enforce stop sequences locally as needed.
- **Anthropic-compatible** (`anthropic-compatible`) — Direct calls to the
  Claude Messages API with the user's Anthropic key.
- **ChatGPT/Codex OAuth** (`chatgpt-oauth`) — Direct calls to the ChatGPT
  backend using a connected ChatGPT/Codex subscription (`/provider connect
codex`). Used only for OpenAI models the subscription supports.

If routing fails to match a provider entry, Openbuff fails closed with a
clear config error. There is no hosted-backend fallback and no credit
deduction.

### 6. Response Flow Back to CLI

1. The provider streams tokens back to the local AI SDK client.
2. `promptAiSdkStream()` yields chunks (`text-delta`, `tool-call`, `error`).
3. `processStream()` in agent-runtime handles each chunk:
   - Text → `sendAction({ type: 'response-chunk', chunk })` → SDK → CLI UI.
   - Tool calls → `requestToolCall()` → SDK executes locally → result is
     fed back into the stream.
4. When the agent loop finishes, `callMainPrompt` emits a `response-chunk`
   `finish` event and a `prompt-response` action with the final session
   state and output.
5. The SDK validates the output against `AgentOutputSchema` and resolves
   the promise.
6. The CLI marks the message complete and renders elapsed time. No credit
   balance is consulted or displayed.

## Tool Call Lifecycle

Tool calls always execute on the user's machine:

```

Control-plane reads and validation use the same local dispatch path. A targeted validation call must include the snapshot ID observed before execution; the SDK rejects the call if the workspace is already stale and rejects its result if files mutate while the command is running. This prevents an old compiler/test result or reviewer verdict from clearing a newer change.
LLM Response (tool_call)          Agent Runtime processes stream
        │                                    │
        ▼                                    ▼
  processStream()  ─── requestToolCall ──▶  SDK run.ts
        │                                    │
        │                              handleToolCall()
        │                                    │
        │                              Executes locally
        │                              (file edit, terminal, search)
        │                                    │
        ◀─────── tool result ───────────────┘
        │
  Feeds result back into next provider call
```

### Staged read-before-edit enforcement

Edit-oriented tools (`str_replace`, `edit_transaction`, and patch
applicators) participate in a staged read-before-edit policy. Under
strict-mode edit flows, the runtime requires a recent `read_files`
authorization for each path before an edit is accepted:

- A successful whole-file `read_files.paths` call mints a per-path
  authorization that allows subsequent exact-match edits to that file. Range
  and symbol reads do not grant whole-file authorization; follow-up edits must
  carry their scoped `readCapability`.
- `basedOnRead` (the read capability returned from a fresh `read_files`
  range) is an authenticated opaque `cap.v3` token bound to the canonical
  project identity, normalized target path, issuing run, line range, and
  content hash. Cross-path and cross-run replay is rejected before content
  matching. Legacy `cap.v2` tokens and explicit range-hash objects remain
  compatible freshness assertions only; they cannot bypass strict
  read-before-edit for an otherwise unread path.
- A successful edit keeps the per-path authorization for the rest of the
  editing flow, while the runtime chains subsequent exact-match edits from the
  latest prepared content. The authorization is path-level permission, not a
  freshness proof: large/ambiguous follow-up edits should use the fresh
  post-edit `basedOnRead` returned by the successful edit or re-read the range.
- Stale-anchor or anchor-not-found failures should be recovered by
  re-reading the exact target range and retrying with the new
  `basedOnRead`, not by guessing from memory. Failure responses never mint a
  replacement capability; only a successful fresh read can issue authority.

This policy keeps deterministic edits aligned with the on-disk content the
agent actually inspected, even when multiple agents or generator-driven
steps interleave reads and writes.

### Reviewer / validation gate semantics

When a turn opts into the reviewer/validation gate, the runtime tracks a set
of **pending gate files** plus validation hooks and a reviewer gate, and
exposes a stable structured contract to the user:

- Pending gate files are recorded with a working-tree content marker of the
  form `sha256:<hash>:<byteLength>` so the gate can detect drift between the
  reviewed snapshot and the live file.
- Durable pass freshness is keyed on that same marker: a previously
  recorded pass is only honored if the current file's marker still matches.
- Missing or unreadable files **fail closed**: the gate refuses to mark the
  turn green rather than silently treating an absent file as passing.
- The user-visible contract is a structured `<gate-state>` block. Tooling
  and downstream agents should parse that block rather than scraping
  surrounding prose.
- File contents themselves are not logged into gate state or transcripts;
  only the hash/byte-length marker and pass/fail status are recorded.
- Versioned reviewer results must echo the exact snapshot fingerprint and
  attest to every pending file. A mismatch or omitted file is blocking.
- Missing hooks or hooks that match no changed files are surfaced as
  `REDUCED_ASSURANCE`, not ordinary validation success.
- Explicit reviewer bypasses retain the reason, authorization timestamp,
  pending files, fingerprint, and completed validation summary.

## Session State

Session state persists across prompts within a conversation:

- `sessionState.mainAgentState.messageHistory` — full conversation history.
- `sessionState.fileContext` — project files, knowledge files, custom tools.
- The CLI stores the `RunState` from each run and passes it as `previousRun`
  to the next `client.run()` call.

## Cancellation

When the user presses Escape:

1. CLI aborts the `AbortController`.
2. The `abort` signal propagates through the SDK → agent runtime → AI SDK.
3. `loopAgentSteps` catches the `AbortError` and finalizes the run as
   cancelled.
4. CLI's abort handler shows an interruption notice and marks the message
   complete.

---

## Removed Upstream Hosted Server Path

The upstream Codebuff project routed inference and authentication through a hosted server with product billing, run records, and provider proxying. That path is not part of Openbuff and the hosted web, billing, BigQuery, and free-mode product surfaces have been removed from the active workspace.

Openbuff replaces that entire hop with direct, BYOK provider calls from the local process. No Openbuff credits are deducted, no run records are written to a hosted database, and no telemetry is uploaded.
