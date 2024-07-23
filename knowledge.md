# Manicode

Manicode is a tool for editing codebases via natural language instruction to Manny, an expert AI programming assistant.

## Key Technologies

- **TypeScript**: The primary programming language used throughout the project.
- **Node.js**: The runtime environment for executing the application.
- **WebSockets**: Used for real-time communication between the client and server.
- **Claude AI**: Powers Manny, the AI programming assistant.

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
5. **Message History**: Manages conversation history between the user and Manny.
6. **Chat Storage**: Persists chat sessions and allows users to manage multiple conversations.
7. **Knowledge Management**: Handles the creation, updating, and organization of knowledge files.

## Important Files

- `backend/src/claude.ts`: Interacts with the Claude AI model.
- `backend/src/server.ts`: Sets up the WebSocket server.
- `common/src/actions.ts`: Defines schemas for client and server actions.
- `src/project-files.ts`: Handles project file operations.
- `src/index.ts`: Contains main application logic and user input handling.
- `knowledge.md`: Stores project-wide knowledge and best practices.

## Development Guidelines

1. Use TypeScript for all new code to maintain type safety.
2. Follow existing code structure and naming conventions.
3. Ensure alternating user and Manny messages in conversation history.
4. Update knowledge files for significant changes or new features.
5. Write clear, concise comments and documentation for complex logic.

## Knowledge Management

- Knowledge is stored in `knowledge.md` files, which can be created in relevant directories throughout the project.
- Manny automatically updates knowledge files when learning new information or correcting mistakes.
- Developers are encouraged to review and commit knowledge file changes to share insights across the team.

## TODO
- Try a better diffing strategy?


# Code guide

- We don't specify return types for functions, since Typescript will infer them. 