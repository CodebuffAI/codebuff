# Codebuff Agent Mode: Conversation Export

This document summarizes the planning and key decisions made for implementing a new "Agent Mode" in Codebuff.

## I. Initial Concept & Brainstorming

The core idea is to evolve Codebuff into an agent capable of handling complex development workflows, including its own development and evaluations.

**User's Initial Thoughts:**
*   Enable Codebuff to manage all parts of the development lifecycle.
*   Introduce an `/agent` mode where Codebuff can be prompted to follow workflows.
*   This mode would use Codebuff (or a version of it) as a primary tool, potentially enabling recursive self-improvement.
*   Key features: persistent terminal, stored memory (in files), auto-context cleaning.
*   Future possibilities: reading the screen, using Codebuff for dogfooding/evals by other companies.
*   Open question: Should the agent delegate tasks to a core Codebuff instance, or should Codebuff's functionality be integrated directly into the agent?

## II. MVP Definition & Detailed Implementation Steps

**User's MVP Goal:**
Create a minimal working example of `/agent` mode that can:
1.  Take an initial prompt from the user.
2.  Operate the terminal using the refined persistent PTY logic.
3.  Have pre-existing knowledge about Codebuff's codebase to allow for self-modification.

### A. CLI Integration & Mode Activation

**Objective:** Allow users to invoke `/agent <initial_task_prompt>` from the CLI.

1.  **Modify `npm-app/src/cli.ts`:**
    *   In the `processCommand` method (or similar input handling logic):
        *   Add a condition to detect if `userInput` starts with `/agent ` (or is just `/agent`).
        *   If matched, extract the `initial_task_prompt` (the part after `/agent `).
        *   Track an analytics event for `/agent` command usage.
        *   The `processCommand` method should return the `initial_task_prompt` (or the full `/agent ...` string) to be handled by `forwardUserInput`.
        *   Modify `forwardUserInput` in `npm-app/src/cli.ts` or `Client.getInstance().sendUserInput` in `npm-app/src/client.ts` to detect if the prompt is an agent command.
        *   If it's an agent command, send a specific message type to the backend, e.g., `{ type: 'agent_initial_prompt', task: initial_task_prompt, agentState: ... }` instead of the standard `{ type: 'prompt', prompt: ... }`.
2.  **Modify `npm-app/src/menu.ts`:**
    *   Add a new entry to the `interactiveCommandDetails` array for the `/agent` command, describing its purpose and syntax (e.g., `/agent [your multi-step task]`).
3.  **Update `npm-app/src/client.ts`:**
    *   Ensure `sendUserInput` (or a new dedicated method) can construct and send the `agent_initial_prompt` message type.
4.  **Update `common/src/actions.ts` (or equivalent schema definition):**
    *   Define the new `AgentInitialPromptActionSchema` for the message sent from client to server (e.g., including `task`, `agentState`, `toolResults?`).
    *   Define an `AgentToolResponseActionSchema` for subsequent messages from the client containing tool results for the agent.
5.  **Update Backend WebSocket Handler (e.g., `backend/src/websockets/server.ts`):**
    *   Add a case to `processMessage` (or equivalent) to handle the new `agent_initial_prompt` action type and the `agent_tool_response` action type.
    *   These cases should call the new `handleAgentPrompt` function, passing the current `agentState` (retrieved or initialized by the client's session/ID).

### B. Backend: Agent-Specific System Prompt

**Objective:** Create and utilize a system prompt tailored for Agent Mode.

1.  **Define `AGENT_SYSTEM_PROMPT` (likely as a const string within `backend/src/agent-prompt.ts`):**
    *   **Content Guidelines:**
        *   "You are Codebuff operating in Agent Mode. Your goal is to accomplish the user's multi-step task autonomously."
        *   "Your primary method of interaction is through tools, especially `run_terminal_command`. Analyze output carefully to decide subsequent actions."
        *   "Available tools: `run_terminal_command`, `read_files`, `write_file`, `code_search`, `add_subgoal`, `update_subgoal`, `end_turn`." (List only essential tools for MVP).
        *   "**Self-Awareness of Codebuff:** You are an instance of Codebuff. You can modify your own source code located in `/Users/jahooma/codebuff`."
        *   "Key Codebuff files: `backend/src/tools.ts`, `npm-app/src/cli.ts`, `npm-app/src/utils/terminal.ts`, `backend/src/agent-prompt.ts`."
        *   "To build/test Codebuff: run `bun run build && bun run test` from the project root (`/Users/jahooma/codebuff`)."
        *   "Terminal commands might return output before they fully complete. The status will indicate this. Use `<command_signal>CTRL_C</command_signal>` with `run_terminal_command` to attempt to stop such processes."
        *   "Use `add_subgoal` and `update_subgoal` to create a plan and track your progress."
        *   "Explain your plan, actions, and results clearly in your response before calling tools."
        *   "Use `end_turn` *only* when the entire task is complete or you absolutely require user input to proceed."
        *   "Focus on achieving the user's task. Be methodical. If a step fails, try to understand why and correct it."
2.  **Integration:** This system prompt will be used directly within `backend/src/agent-prompt.ts`.

### C. Terminal Implementation Refinement (in `npm-app/src/utils/terminal.ts`)

**Objective:** Implement robust, persistent terminal interaction for the agent.
*(This section summarizes the already discussed and (conceptually) implemented changes)*
*No new sub-steps, this section is a summary of prior decisions.*

### D. Backend: New Agent Prompt Handler (`backend/src/agent-prompt.ts`)

**Objective:** Create a new, simplified backend prompt handler for Agent Mode using Gemini Pro.

1.  **Create `backend/src/agent-prompt.ts`:**
2.  **Define `AGENT_SYSTEM_PROMPT` String:**
    *   Store the system prompt content from **Section II.B.1** directly in this file.
3.  **Implement `handleAgentPrompt` Function:**
    *   **Signature:** `async function handleAgentPrompt(ws: WebSocket, action: AgentInitialPromptAction | AgentToolResponseAction, userId: string | undefined, clientSessionId: string, agentState: AgentState, onResponseChunk: (chunk: string) => void, fileContext: ProjectFileContext)`
    *   **Message History Management:**
        *   Initialize `currentMessageHistory` based on `agentState.messageHistory`.
        *   If `action.type === 'agent_initial_prompt'`, and `agentState.messageHistory` is empty or a new task is indicated, reset `currentMessageHistory = [{ role: 'system', content: AGENT_SYSTEM_PROMPT }, { role: 'user', content: action.task }]`.
        *   If `action.type === 'agent_tool_response'`, append `action.toolResults` (as a system message containing XML tool results) to `currentMessageHistory`.
    *   **Model Configuration & Streaming:**
        *   Use `getAgentStream` (from `backend/src/prompt-agent-stream.ts` - this might need to be generalized or a new similar function created if `getAgentStream` is too specific to existing flows).
        *   Pass `currentMessageHistory`.
        *   Configure for `model: models.gemini2_5_pro_preview` (or a specific Gemini Pro model).
        *   **Stop Sequences:** Include a string that matches the end of a terminal command tool call, e.g., `_terminal_command>`. Also include standard tool call closing tags like `</tool_name>` for other tools.
    *   **Response Processing Loop (Conceptual):**
        *   `fullResponse = ""`
        *   `toolCalls: RawToolCall[] = []`
        *   `for await (const chunk of llmStream)`:
            *   `fullResponse += chunk`
            *   `onResponseChunk(chunk)` (stream to client via WebSocket).
            *   Parse `fullResponse` for complete tool calls using `parseToolCalls` (from `backend/src/tools.ts`). If new complete tool calls are found, add them to `toolCalls`.
        *   Append `{ role: 'assistant', content: fullResponse }` to `currentMessageHistory`.
    *   **Tool Execution & State Update:**
        *   If `toolCalls` is not empty:
            *   Send `toolCalls` to the client via WebSocket (e.g., `{ type: 'agent_request_tool_execution', toolCalls: toolCalls }`).
            *   Update `agentState.messageHistory = currentMessageHistory`.
            *   The client will execute tools and send back an `agent_tool_response` action, triggering `handleAgentPrompt` again.
        *   If `toolCalls` is empty (LLM decided to `end_turn` or finished the task):
            *   Update `agentState.messageHistory = currentMessageHistory`.
            *   The `fullResponse` is the agent's final textual response for this turn.
            *   If `fullResponse` contains `<end_turn></end_turn>`, the agent considers its current sub-task or overall task complete for now.
    *   **Agent State Persistence:**
        *   The `agentState` (including `messageHistory`, `subgoals`, etc.) needs to be persisted between calls. This could be managed by the `backend/src/websockets/server.ts` layer, associating it with `clientSessionId` or `userId`. For MVP, it might be held in memory on the server, associated with the WebSocket connection, or passed back and forth with each client-server message.
    *   **Subgoal Handling:**
        *   Tool calls for `add_subgoal` and `update_subgoal` should be processed by the backend (similar to how `mainPrompt` might handle them, perhaps by directly modifying `agentState.subgoals` after parsing the tool call, before sending to client if these tools don't require client-side execution).
        *   Alternatively, these could be special tool calls the client handles by updating its local `agentState` and then sending the updated state back. For simplicity, backend processing might be easier initially.

### E. Client-Side Agent Logic (`npm-app/src/client.ts` and `npm-app/src/tool-handlers.ts`)

**Objective:** Enable the client to interact with the agent backend and execute tools.

1.  **Modify `npm-app/src/client.ts`:**
    *   **Agent State Management:**
        *   Store `agentState: AgentState` within the `Client` instance. Initialize with `getInitialAgentState()`.
        *   When sending `agent_initial_prompt` or `agent_tool_response`, include the current `agentState`.
        *   When receiving messages from the agent backend, update the local `agentState` if the backend sends updates (e.g., to subgoals).
    *   **Handle `agent_request_tool_execution` message from backend:**
        *   Iterate through `toolCalls`.
        *   For each tool call, invoke the appropriate handler from `npm-app/src/tool-handlers.ts` (e.g., `handleRunTerminalCommand`, `handleReadFile`, etc.).
        *   Ensure `handleRunTerminalCommand` uses `isAgentMode: true`.
        *   Collect all `ToolResult` objects.
        *   Send an `agent_tool_response` message back to the server: `{ type: 'agent_tool_response', toolResults: collectedResults, agentState: currentAgentState }`.
2.  **Modify `npm-app/src/tool-handlers.ts`:**
    *   Ensure all tool handlers used by the agent can be called programmatically and return `ToolResult` objects.
    *   `handleRunTerminalCommand` needs to correctly use the `isAgentMode` flag passed down from the agent invocation path.

## III. Future Considerations (Post-MVP)
*   More sophisticated memory management for the agent (e.g., vector DB for long-term memory).
*   Agent ability to run Codebuff CLI commands itself (recursive self-operation).
*   Screen reading capabilities.
*   More complex planning and decomposition of tasks.
*   Error handling and self-correction loops for the agent.

This captures the main points of our discussion and the plan for the Agent Mode MVP.
