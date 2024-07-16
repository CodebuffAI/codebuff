# Manicode

Manicode is a tool for editing codebases via natural language instruction to an assistant.

## Key Technologies

- **TypeScript**: The primary programming language used throughout the project.
- **Node.js**: The runtime environment for executing the application.
- **WebSockets**: Used for real-time communication between the client and server.

## Project Structure

There are three top-level code directories:
- `common`: Contains shared code and utilities used across the project.
- `backend`: Houses the server-side code and API implementation.
- `src`: Contains the main application source code.

## Main Components

1. **Claude Integration**: Processes natural language instructions and generates code changes.
2. **WebSocket Server**: Handles real-time communication between the client and the backend.
3. **File Management**: Reads, parses, and modifies project files.
4. **Action Handling**: Processes various client and server actions.
5. **Message History**: Manages conversation history between the user and the assistant.

## Important Files

- `backend/src/claude.ts`: Interacts with the Claude AI model.
- `backend/src/server.ts`: Sets up the WebSocket server.
- `common/src/actions.ts`: Defines schemas for client and server actions.
- `src/project-files.ts`: Handles project file operations.
- `src/index.ts`: Contains main application logic and user input handling.

## Development Guidelines

1. Use TypeScript for all new code to maintain type safety.
2. Follow existing code structure and naming conventions.
3. Ensure alternating user and assistant messages in conversation history.
4. Update this knowledge file for significant changes or new features.

## TODO

- Implement error handling for edge cases.
- Optimize performance for large codebases.