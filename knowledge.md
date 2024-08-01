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
8. **Terminal Command Execution**: Allows Manny to run shell commands in the user's terminal.

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
6. Remember that imports automatically remove 'src' from the path. When editing files, always include 'src' in the file path if it's part of the actual directory structure.

## Knowledge Management

- Knowledge is stored in `knowledge.md` files, which can be created in relevant directories throughout the project.
- Manny automatically updates knowledge files when learning new information or correcting mistakes.
- Developers are encouraged to review and commit knowledge file changes to share insights across the team.

## Terminal Command Execution

Manny can now execute terminal commands using the `run_terminal_command` tool. This feature allows Manny to perform various tasks such as:

- Searching files with grep
- Installing dependencies
- Running build or test scripts
- Checking versions of installed tools
- Performing git operations
- Creating, moving, or deleting files and directories

## Important Constraints

- **Max Tokens Limit**: The context for Claude AI has a maximum limit of 200,000 tokens. This is an important constraint to consider when designing prompts and managing project file information.

## TODO
- None

# Code guide

- We don't specify return types for functions, since Typescript will infer them. 
- Always include 'src' in file paths when it's part of the actual directory structure, even though imports automatically remove it. 