# Async Agents Implementation Plan

## Overview

Implement asynchronous agent spawning that allows parent agents to spawn children that run independently, with communication capabilities and proper lifecycle management.

## Phase 1: Core Infrastructure

### 1.1 New Tool Definitions

Create two new tools in `backend/src/tools/definitions/`:

**spawn_agents_async.ts**

```ts
export const spawnAgentsAsyncTool = {
  toolName: 'spawn_agents_async',
  parameters: z.object({
    agents: z.array(
      z.object({
        agent_type: z.string(),
        prompt: z.string().optional(),
        params: z.record(z.string(), z.any()).optional(),
      })
    ),
  }),
}
```

**send_agent_message.ts**

```ts
export const sendAgentMessageTool = {
  toolName: 'send_agent_message',
  parameters: z.object({
    agent_id: z.string(),
    prompt: z.string(),
    params: z.record(z.string(), z.any()).optional(),
  }),
}
```### 1.2 Agent State Management
Extend `AgentState` in `common/src/types/session-state.ts`:
```ts
interface AgentState {
  // ... existing fields
  asyncChildren: string[] // Track spawned async agent IDs
  parentAgentId?: string // Reference to parent for communication
  isAsync: boolean // Flag to identify async agents
}
```

### 1.3 Remove update_report Tool
**Decision**: Remove `update_report` tool for async agents. All structured data communication between parent and child agents will use `send_agent_message` with data in the prompt or params. This simplifies the communication model and makes it more consistent.

### 1.4 Parent ID Injection
**Strategy**: In `run-agent-step.ts`, inject a system message for async child agents:
```ts
if (agentState.parentAgentId) {
  messages.push({
    role: 'user',
    content: asSystemMessage(`Your parent agent ID is: ${agentState.parentAgentId}. You can send messages to your parent using send_agent_message with agent_id: "${agentState.parentAgentId}".`)
  })
}
```

Alternatively, support special string replacement in `send_agent_message` where `'PARENT_ID'` gets replaced with actual parent ID.

### 1.3 Async Agent Registry

Create `backend/src/async-agent-manager.ts`:

```ts
class AsyncAgentManager {
  private runningAgents = new Map<string, AsyncAgentInstance>()

  async spawnAsync(agentConfig, parentId, ws): Promise<string>
  async sendMessage(agentId, message): Promise<void>
  async terminateAgent(agentId): Promise<void>
}
```

## Phase 2: Tool Handlers

### 2.1 Async Spawn Handler

In `backend/src/tools/handlers/spawn-agents-async.ts`:

- Generate unique agent IDs for each spawned agent
- Start agents in background using `loopAgentSteps`
- Return immediately with agent IDs
- Register agents in AsyncAgentManager
- Set up completion callbacks to notify parent

### 2.2 Message Handler

In `backend/src/tools/handlers/send-agent-message.ts`:

- Validate agent ID exists and is accessible
- Inject message into target agent's message queue
- Wake up agent if idle by triggering new agent step

## Phase 3: Agent Execution Flow

### 4.1 Modified Agent Loop

Update `backend/src/run-agent-step.ts`:

- Check for incoming messages before each step
- Inject messages as user inputs when received
- Handle async agent completion notifications

### 4.2 Parent Agent Lifecycle

- Parent agents track async children in their state
- Parent cannot fully complete until all async children finish
- Implement `await_agents` tool for explicit waiting

## Open Questions & Solutions

### Q1: Should we remove update_report and rely on send_agent_message?

**Solution**: Yes, remove `update_report` tool for async agents. Use `send_agent_message` with structured data in the prompt or params instead. This simplifies the communication model and makes it more consistent.

### Q2: How should async agents know their parent ID?

**Solution**: Inject a system message in `run-agent-step.ts` that tells the agent its parent ID. Alternatively, accept a special string 'PARENT_ID' in `send_agent_message` that gets replaced with the actual parent ID.

### Q3: How to handle agent persistence across server restarts?

**Simple Solution**: Don't persist - async agents die with server restart. Document this limitation.
**Complex Solution**: Serialize agent state to Redis/DB with resumption logic.
**Recommendation**: Start simple, add persistence later if needed.

### Q4: How to handle WebSocket message ordering?

**Solution**:

- Use message queues per agent ID
- Process messages sequentially per agent
- Add sequence numbers for ordering guarantees

### Q5: How to handle tool result propagation?

**Solution**:

- Async agents send completion results as tool results to parent
- Use existing `toolResults` mechanism in `processStreamWithTools`
- Parent receives async completion as if it were a regular tool call### Q6: How to handle user cancellation (Ctrl-C/ESC) or exit?
**Solution**: When user cancels or exits Codebuff, kill all running agents including async ones. 

All async agents tied to a session should be terminated when that session ends.

## Testing Strategy

- Unit tests for AsyncAgentManager
- Integration tests for parent-child communication
- Edge case tests for cleanup and error handling
