# Codebuff Client Package (v0)

## Overview

A simplified client package for interacting with the Codebuff backend. This package:
- Handles WebSocket communication
- Streams text responses (AI output + rendered tool interactions)
- Executes tools directly (like npm-app)
- Manages file system operations directly
- Enables both CLI (npm-app) and programmatic (operator) usage

## Architecture

### 1. Package Structure
```
client/
  src/
    index.ts             # Main exports
    client.ts            # Core Client class
    connection/
      websocket.ts       # WebSocket connection management
      retry.ts          # Reconnection logic
      status.ts         # Connection status types
    actions/
      dispatcher.ts     # Send actions to backend
      handlers.ts       # Process incoming actions
      types.ts         # Action-related types
    tools/
      executor.ts      # Tool execution (adapted from npm-app)
      types.ts         # Tool-related types
      renderers.ts     # Tool output rendering
    auth/
      fingerprint.ts   # Device fingerprinting
      token.ts        # Auth token management
    events/
      emitter.ts      # Event emission system
      types.ts        # Event types
      stream.ts       # AsyncIterable event streams
    types/
      index.ts        # Package-wide types
      config.ts       # Configuration types
    errors/
      index.ts        # Custom error types
    utils/
      logger.ts       # Logging utilities
      stream.ts       # Stream helpers
```

### 2. Core Interfaces

#### Connection Status
```typescript
enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}
```

#### Client Configuration
```typescript
interface ClientConfig {
  websocketUrl: string;
  projectRoot: string;
  debug?: boolean;
  timeout?: number;
  retry?: RetryOptions;
  auth?: {
    fingerprintId?: string;
    authToken?: string;
  };
}
```

#### Main Client Class
```typescript
class CodebuffClient {
  constructor(config: ClientConfig);
  
  // Core methods
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  // Main interaction method
  sendPrompt(options: {
    prompt: string;
    agentState: AgentState;
    model?: string;
  }): AsyncIterableStream<ClientEvent>;
  
  // Authentication
  login(options?: LoginOptions): Promise<void>;
  logout(): Promise<void>;
  
  // State
  getStatus(): ConnectionStatus | ConnectionError;
  getAgentState(): AgentState | null;
}
```

#### Events System
```typescript
interface ClientEventMap {
  // Main output stream - includes AI text and rendered tool output
  'text': { 
    type: 'text';
    content: string;
    source: 'ai' | 'tool-call' | 'tool-result';
  };
  
  // Tool lifecycle events (for observation only)
  'tool-start': { 
    type: 'tool-start';
    tool: ToolCall;
  };
  'tool-end': { 
    type: 'tool-end';
    result: ToolResult;
  };
  
  // File changes from tool execution
  'file-change': {
    type: 'file-change';
    change: FileChange;
  };
  
  // Connection status
  'status': { 
    type: 'status';
    status: ConnectionStatus;
    message?: string;
  };
  
  // Errors
  'error': {
    type: 'error';
    error: CodebuffError;
  };
  
  // Stream completion
  'complete': {
    type: 'complete';
    agentState: AgentState;
  };
}

type ClientEvent = ClientEventMap[keyof ClientEventMap];
```

### 3. Tool Execution

The client executes tools directly, similar to npm-app:

```typescript
class ToolExecutor {
  constructor(projectRoot: string);
  
  async execute(
    call: ToolCall,
    agentState: AgentState
  ): Promise<ToolResult>;
  
  private async executeTerminalCommand(
    call: ToolCall & { name: 'run_terminal_command' }
  ): Promise<ToolResult>;
  
  private async executeWriteFile(
    call: ToolCall & { name: 'write_file' }
  ): Promise<ToolResult>;
  
  // ... other tool implementations
}
```

### 4. Usage Examples

#### CLI Usage (npm-app)
```typescript
const client = new CodebuffClient({
  websocketUrl: 'ws://localhost:3000',
  projectRoot: process.cwd()
});

await client.connect();

// Send prompt and handle response stream
const stream = await client.sendPrompt({
  prompt: 'Add a console.log statement',
  agentState: currentState
});

for await (const event of stream) {
  switch (event.type) {
    case 'text':
      // Write AI output or rendered tool interactions
      process.stdout.write(event.content);
      break;
      
    case 'tool-start':
      // Optional: Show tool execution status
      console.log(`Executing ${event.tool.name}...`);
      break;
      
    case 'file-change':
      // Optional: Log file modifications
      console.log(`Modified ${event.change.path}`);
      break;
      
    case 'complete':
      currentState = event.agentState;
      break;
  }
}
```

#### Programmatic Usage (operator)
```typescript
const client = new CodebuffClient({
  websocketUrl: 'ws://localhost:3000',
  projectRoot: '/path/to/project'
});

// Collect all events
const events: ClientEvent[] = [];
for await (const event of await client.sendPrompt({
  prompt: 'Fix the bug in foo.ts',
  agentState: currentState
})) {
  events.push(event);
  
  if (event.type === 'complete') {
    currentState = event.agentState;
  }
}

// Analyze results
const fileChanges = events.filter(
  (e): e is ClientEventMap['file-change'] =>
    e.type === 'file-change'
);
```

### 5. Implementation Phases

#### Phase 1: Core Infrastructure
1. Basic package setup
2. WebSocket connection management
3. Action dispatching/handling
4. Event system implementation

#### Phase 2: Tool Execution
1. Port npm-app's tool execution logic
2. Implement tool renderers
3. Direct file system operations
4. Tool result handling

#### Phase 3: Stream Processing
1. Response streaming implementation
2. Event type definitions
3. Error handling
4. Timeout management

#### Phase 4: Integration
1. Update npm-app to use client
2. Create operator package using client
3. Documentation and examples

### 6. Testing Strategy

1. Unit Tests
   - WebSocket connection management
   - Tool execution
   - Event emission
   - Stream processing

2. Integration Tests
   - Full prompt/response cycle
   - Tool execution
   - File operations
   - Error scenarios

3. E2E Tests
   - npm-app integration
   - operator integration
   - Basic usage examples

## Next Steps

1. Create initial package structure
2. Implement WebSocket connection
3. Port tool execution from npm-app
4. Add streaming support