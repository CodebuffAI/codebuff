# Request Flow: CLI → Server → CLI

This document traces the exact path a user prompt takes from the Codebuff CLI through the SDK, agent runtime, server, and back.

## Overview

```
┌─────────┐    ┌─────────┐    ┌───────────────┐    ┌────────────────┐    ┌──────────┐
│   CLI   │───▶│   SDK   │───▶│ Agent Runtime │───▶│ Codebuff Server│───▶│ LLM API  │
│  (TUI)  │◀───│ run.ts  │◀───│ loopAgentSteps│◀───│  /v1/chat/...  │◀───│(OR/OAI/..)│
└─────────┘    └─────────┘    └───────────────┘    └────────────────┘    └──────────┘
```

## Step-by-Step Flow

### 1. CLI: User Input

**Files:** `cli/src/hooks/use-send-message.ts`, `cli/src/hooks/helpers/send-message.ts`

1. User types a prompt and hits Enter.
2. `prepareUserMessage()` processes the input:
   - Collects pending bash context (terminal output since last prompt)
   - Processes image and text attachments
   - Creates a user message in the chat UI
3. `setupStreamingContext()` initializes:
   - An `AbortController` (for user cancellation via Escape)
   - A timer (tracks elapsed time)
   - A batched message updater (efficiently updates the UI)
4. The CLI calls `client.run()` from the SDK.

### 2. SDK: Orchestration

**File:** `sdk/src/run.ts`

1. `run()` → `runOnce()` is called with the prompt, agent ID, cost mode, and session state.
2. **Session state** is initialized (fresh) or restored (from `previousRun`).
3. **User identity** is verified via `getUserInfoFromApiKey()` (calls the web API).
4. **Tool handlers** are registered — these execute locally on the user's machine:
   - `write_file`, `str_replace`, `apply_patch` → file edits
   - `run_terminal_command` → shell commands
   - `code_search`, `glob`, `list_directory` → file search
   - `read_files` → file reading
   - Custom tool definitions and MCP tools
5. **Action handlers** are registered to process server responses:
   - `response-chunk` → streams text to the CLI
   - `subagent-response-chunk` → streams subagent output
   - `prompt-response` → final result (resolves the promise)
   - `prompt-error` → error result
6. `callMainPrompt()` is called (fire-and-forget, with a `.catch()` handler).
7. The function returns a promise that resolves when `prompt-response` or an error arrives.

### 3. Agent Runtime: Main Prompt

**File:** `packages/agent-runtime/src/main-prompt.ts`

1. `callMainPrompt()` resets credits to 0 (server controls cost tracking).
2. Assembles **local agent templates** from the project's `.agents/` directory.
3. Sends a `response-chunk` `start` event to the CLI.
4. `mainPrompt()` determines the **agent type** based on cost mode:
   - `free` → `base-free`
   - `normal` → `base`
   - `max` → `base-max`
   - `ask` → `ask`
   - `experimental` → `base2`
   - Fallback (default) → `base2`
   - Or a custom agent ID
5. Calls `loopAgentSteps()` with the agent template, prompt, and session state.

### 4. Agent Runtime: Agent Loop

**File:** `packages/agent-runtime/src/run-agent-step.ts`

1. `loopAgentSteps()` starts an **agent run** (recorded in the database).
2. Builds the **system prompt**, **tool definitions**, and **initial messages**.
3. Enters the main loop:
   ```
   while (true) {
     // 1. Run programmatic step (if agent has handleSteps)
     // 2. Check if turn should end
     // 3. Call runAgentStep() for LLM inference
     // 4. Process tool calls and responses
   }
   ```
4. Each `runAgentStep()` call:
   - Checks context token count via the `/api/v1/token-count` endpoint
   - Calls `getAgentStreamFromTemplate()` → `promptAiSdkStream()`
   - `processStream()` iterates over the AI SDK stream, handling text chunks and tool calls
   - Tool calls are sent back to the SDK via `requestToolCall`, executed locally, and results fed back
5. The loop continues until the agent signals completion (no more tool calls, or `task_completed` tool).
6. Sends a `response-chunk` `finish` event, then a `prompt-response` action with the final session state and output.

### 5. LLM Call: Model Provider Selection

**Files:** `sdk/src/impl/llm.ts`, `sdk/src/impl/model-provider.ts`

`promptAiSdkStream()` selects the model provider:

1. **Claude OAuth** — If the user has connected their Claude subscription and the model is a Claude model, requests go directly to `api.anthropic.com` using the user's OAuth token. Zero cost to the user's Codebuff credits.
2. **ChatGPT OAuth** — If the user has connected their ChatGPT subscription and the model is an OpenAI model, requests go to the ChatGPT backend API.
3. **Codebuff Backend** (default) — Requests go to `POST /api/v1/chat/completions` on the Codebuff web server, which routes to the appropriate LLM provider.

For OAuth providers, rate limit errors trigger automatic fallback to the Codebuff backend (unless in free mode).

The AI SDK's `streamText()` function handles the actual HTTP call, streaming, and retry logic.

### 6. Server: Chat Completions Endpoint

**File:** `web/src/app/api/v1/chat/completions/_post.ts`

The server processes the request through several validation gates:

1. **Parse request body** — Returns 400 if invalid JSON.
2. **Authenticate** — Extracts API key from `Authorization` header. Returns 401 if missing/invalid.
3. **Check ban status** — Returns 403 `account_suspended` if user is banned.
4. **Free mode country check** — For free mode requests, checks user's IP against allowed countries. Returns 403 `free_mode_unavailable` if not allowed.
5. **Validate agent run** — Checks the `run_id` exists and is in `running` status. Returns 400 if invalid.
6. **Subscription block grant** — For subscribers, ensures a billing block is active. Returns 429 `rate_limit_exceeded` if limit hit and fallback disabled.
7. **Credit check** — Returns 402 if user has no remaining credits (and not a free mode request).
8. **Route to LLM provider** — Based on the model, routes to:
   - Fireworks AI (for supported models)
   - OpenAI direct (for OpenAI models)
   - OpenRouter (default, for all other models)
9. **Return response** — Streaming requests return an SSE stream (`text/event-stream`). Non-streaming requests return JSON.

### 7. Response Flow Back to CLI

1. The LLM provider streams tokens back to the server.
2. The server forwards the SSE stream to the AI SDK client.
3. `promptAiSdkStream()` yields chunks from the AI SDK's `fullStream`:
   - `text-delta` → text content
   - `tool-call` → tool invocation
   - `error` → error handling (OAuth fallback, retries, etc.)
4. `processStream()` in agent-runtime handles each chunk:
   - Text chunks → `sendAction({ type: 'response-chunk', chunk })` → SDK → CLI UI
   - Tool calls → `requestToolCall()` → SDK executes locally → result fed back to stream
5. When the agent loop finishes, `callMainPrompt` sends:
   - A `response-chunk` `finish` event (with total cost)
   - A `prompt-response` action (with final session state and output)
6. The SDK's `handlePromptResponse()` validates the output against `AgentOutputSchema` and resolves the promise.
7. The CLI's `handleRunCompletion()` processes the result:
   - Checks for known error types (out of credits, free mode unavailable)
   - Updates the UI with completion time and credit cost
   - Marks the message as complete

## Tool Call Lifecycle

Tool calls execute **locally on the user's machine**, not on the server:

```
LLM Response (tool_call)            Agent Runtime processes stream
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
  Feeds result back into next LLM call
```

## Session State

Session state persists across prompts within a conversation:

- `sessionState.mainAgentState.messageHistory` — Full conversation history
- `sessionState.fileContext` — Project files, knowledge files, custom tools
- The CLI stores the `RunState` from each run and passes it as `previousRun` to the next `client.run()` call

## Cancellation

When the user presses Escape:

1. CLI aborts the `AbortController`
2. The `abort` signal propagates through the SDK → agent runtime → AI SDK
3. `loopAgentSteps` catches the `AbortError`, marks the run as `cancelled`
4. CLI's abort handler shows an interruption notice and marks the message complete
