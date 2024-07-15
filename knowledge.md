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

1. **Claude Integration**: The project integrates with Claude, an AI model, for processing natural language instructions and generating code changes.

2. **WebSocket Server**: Handles real-time communication between the client and the backend.

3. **File Management**: Includes utilities for reading, parsing, and modifying project files.

4. **Action Handling**: Defines and processes various client and server actions.

## Important Files

- `backend/src/claude.ts`: Contains functions for interacting with the Claude AI model.
- `backend/src/server.ts`: The main server file that sets up the WebSocket server.
- `common/src/actions.ts`: Defines the schemas for client and server actions.
- `src/project-files.ts`: Handles operations related to project files, including applying changes.

## Development Guidelines

1. Use TypeScript for all new code to maintain type safety across the project.
2. Follow the existing code structure and naming conventions when adding new features or modifying existing ones.
3. Update this knowledge file when making significant changes or adding new features to the project.

## TODO

- [Add any ongoing tasks or planned features here]