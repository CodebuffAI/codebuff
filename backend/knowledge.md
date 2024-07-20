
# Manicode Backend

This document provides an overview of the Manicode backend architecture, key components, and important concepts.

## Table of Contents

1. [Project Structure](#project-structure)
2. [Key Technologies](#key-technologies)
3. [Main Components](#main-components)
4. [WebSocket Communication](#websocket-communication)
5. [Claude Integration](#claude-integration)
6. [File Management](#file-management)
7. [Development Guidelines](#development-guidelines)

## Project Structure

The backend directory is organized as follows:

```
backend/
├── src/
│   ├── websockets/
│   │   ├── server.ts
│   │   ├── switchboard.ts
│   │   └── websocket-action.ts
│   ├── claude.ts
│   ├── prompts.ts
│   ├── server.ts
│   ├── system-prompt.ts
│   └── tools.ts
├── package.json
└── tsconfig.json
```

## Key Technologies

- **TypeScript**: The primary language used for backend development.
- **Node.js**: The runtime environment for executing the backend server.
- **Express**: Web application framework for handling HTTP requests.
- **WebSocket (ws)**: Library for real-time, bidirectional communication between client and server.
- **Anthropic AI SDK**: Used for integrating with the Claude AI model.

## Main Components

### 1. Server (server.ts)

The main entry point for the backend application. It sets up the Express server and initializes the WebSocket server.

### 2. WebSocket Server (websockets/server.ts)

Handles real-time communication with clients. It manages connections, message parsing, and routing of WebSocket messages.

### 3. Switchboard (websockets/switchboard.ts)

Manages client connections, subscriptions, and topics. It's responsible for tracking client states and handling pub/sub functionality.

### 4. Claude Integration (claude.ts)

Provides functions for interacting with the Claude AI model, including streaming responses and handling tool calls.

### 5. Prompts (prompts.ts)

Contains functions for generating prompts, processing Claude's responses, and managing file changes based on AI suggestions.

### 6. System Prompt (system-prompt.ts)

Generates the system prompt used for initializing the AI assistant with project-specific context and instructions.

### 7. Tools (tools.ts)

Defines the available tools that can be used by the AI assistant, such as reading project files.

## WebSocket Communication

The backend uses WebSockets for real-time, bidirectional communication with clients. Key concepts include:

- **Message Types**: Various message types (e.g., 'identify', 'subscribe', 'action') for different operations.
- **Action Handling**: The `websocket-action.ts` file processes incoming action messages and triggers appropriate responses.
- **Subscription Management**: Clients can subscribe to specific topics for targeted updates.

## Claude Integration

The backend integrates with the Claude AI model to process user inputs and generate code changes. Important aspects include:

- **Streaming Responses**: Responses from Claude are streamed in real-time to the client.
- **Tool Calls**: The AI can make tool calls (e.g., reading files) during its processing.
- **File Change Management**: The backend processes AI-suggested file changes and applies them to the project.

## File Management

The backend handles file operations for the Manicode project:

- **Reading Files**: The `read_files` tool allows the AI to access project file contents.
- **Applying Changes**: The `applyChanges` function in `prompts.ts` processes and applies file modifications suggested by the AI.

## Development Guidelines

1. **Type Safety**: Utilize TypeScript's type system to ensure code reliability and catch errors early.
2. **Error Handling**: Implement proper error handling and logging throughout the application.
3. **Code Organization**: Keep related functionality grouped in appropriate modules and files.
4. **Documentation**: Maintain clear and up-to-date documentation, including this knowledge file.
5. **Testing**: Implement unit tests for critical components and functions.
6. **Environment Variables**: Use environment variables for configuration and sensitive information.
7. **Code Style**: Follow consistent coding style and use tools like Prettier for formatting.

## Diffing Algorithm

- The `generateDiffBlocks` function uses a sliding window approach to find matches between old and new file content.
- The `windowSize` parameter in `findNextMatch` affects the algorithm's behavior:
  - Larger values can help handle scattered small changes better.
  - However, increasing `windowSize` has downsides:
    - Decreased performance (O(windowSize^2) time complexity per `findNextMatch` call).
    - Potential for less accurate diffs with very large values.
    - May mask large-scale structural changes if set too high.
  - The optimal `windowSize` depends on typical file structures and change patterns in the project.
  - Consider profiling with different `windowSize` values to find the best balance for your use case.

## TODO

- Implement authentication and authorization for WebSocket connections.
- Add more comprehensive error handling and logging.
- Develop a caching mechanism for frequently accessed file contents.
- Implement rate limiting for AI requests to manage resource usage.
- Create a robust testing suite for backend components.
