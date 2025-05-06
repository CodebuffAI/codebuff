# Client Package

## Overview

The client package provides a WebSocket-based client for communicating with the Codebuff backend. It handles:
- WebSocket connection management with automatic reconnection
- Message serialization/deserialization
- Event streaming
- Tool execution
- File change tracking

## Core Components

### CodebuffClient

Main client class that users interact with. Provides high-level API for:
- Connecting/disconnecting
- Sending prompts
- Receiving streamed responses
- Getting connection status
- Getting agent state

```typescript
const client = new CodebuffClient({
  websocketUrl: 'ws://localhost:3000/ws',
  projectRoot: process.cwd(),
  retry: { maxAttempts: 3 }
});
```

### WebSocket Connection

- Managed by `WebSocketClient` class
- Handles automatic reconnection with exponential backoff
- Configurable retry options (attempts, delays)
- Emits connection status events

### Event System

Events are emitted for:
- Text responses (`text`)
- Tool lifecycle (`tool-start`, `tool-end`)
- File changes (`file-change`) 
- Connection status (`status`)
- Errors (`error`)
- Stream completion (`complete`)

### Action Handling

- `ActionDispatcher`: Sends actions to server (prompts, tool results)
- `ActionHandler`: Processes server actions (responses, tool calls)
- Uses schemas from `common` package for validation

## Usage Guidelines

### Connection Management

- Always call `connect()` before using client
- Call `disconnect()` when done
- Handle connection errors via status events
- Connection auto-reconnects on failure

### Prompt Streaming

```typescript
const stream = await client.sendPrompt({
  prompt: "Hello",
  agentState: currentState
});

for await (const event of stream) {
  if (event.type === 'text') {
    console.log(event.content);
  }
}
```

### Tool Execution

Tools are executed automatically when server requests them:
1. Server sends tool call action
2. Client executes tool locally
3. Result sent back to server
4. Tool output rendered in response stream

### File Changes

- Track file changes via `file-change` events
- Changes come from tool execution
- Update local file state accordingly

## Configuration

### Required Config
- `websocketUrl`: WebSocket server URL
- `projectRoot`: Local project directory

### Optional Config
- `retry.maxAttempts` (default: 5)
- `retry.initialDelay` (default: 1000ms)
- `retry.maxDelay` (default: 30000ms)
- `retry.backoffFactor` (default: 2)

## Testing

- Use `jest.setTimeout(60000)` for E2E tests
- Mock WebSocket server responses
- Clean up connections in `afterEach`
- See `e2e.test.ts` for examples

## Common Issues

1. Connection timeouts
   - Check server URL is correct
   - Ensure server is running
   - Check network connectivity

2. Tool execution failures
   - Verify project root is correct
   - Check tool has necessary permissions
   - Validate tool parameters

3. Event stream termination
   - Handle errors appropriately
   - Check for connection drops
   - Verify stream completion events

## Best Practices

1. Error Handling
   ```typescript
   client.on('error', (event) => {
     console.error('Client error:', event.error);
   });
   ```

2. Status Monitoring
   ```typescript
   client.on('status', (event) => {
     console.log('Connection status:', event.status);
   });
   ```

3. Resource Cleanup
   ```typescript
   try {
     await client.connect();
     // ... use client
   } finally {
     await client.disconnect();
   }
   ```

4. Stream Processing
   - Always process all events
   - Check event types
   - Handle errors in stream
   - Clean up event listeners

## Architecture Notes

- Built on standard WebSocket protocol
- Uses event emitter pattern
- Modular design with clear separation:
  - Connection management
  - Event handling
  - Action dispatching
  - Tool execution
- Shared types with backend via `common` package