# Manicode

Manicode is a tool for editing codebases via natural language instruction to Mani, an expert AI programming assistant.

## File Change Management

Manicode uses the generate diffs by expansion strategy for managing file changes. This approach has Haiku expand a file with placeholders into the full file, and then generates string patches instead of search and replace blocks.

Key points:

- The FileChanges type is an array of string patches.
- The mainPrompt function uses the generatePatch function from generate-diffs-via-expansion.ts to create patches.
- The client-side code applies patches using the applyPatch function from the 'diff' library.

This change improves the accuracy and reliability of file modifications, especially for complex changes or when dealing with large files.

## Project Goals

1. **Developer Productivity**: Reduce the time and effort required for common programming tasks, allowing developers to focus on higher-level problem-solving.

2. **Learning and Adaptation**: Develop a system that learns from user interactions and improves its assistance over time.

3. **Focus on power users**: Make expert software engineers move even faster.

## Key Technologies

- **TypeScript**: The primary programming language used throughout the project.
- **Node.js**: The runtime environment for executing the application.
- **WebSockets**: Used for real-time communication between the client and server.
- **Claude AI**: Powers Mani, the AI programming assistant.

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
5. **Message History**: Manages conversation history between the user and Mani.
6. **Chat Storage**: Persists chat sessions and allows users to manage multiple conversations.
7. **Knowledge Management**: Handles the creation, updating, and organization of knowledge files.
8. **Terminal Command Execution**: Allows Mani to run shell commands in the user's terminal.

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
3. Ensure alternating user and Mani messages in conversation history.
4. Update knowledge files for significant changes or new features.
5. Write clear, concise comments and documentation for complex logic.
6. Remember that imports automatically remove 'src' from the path. When editing files, always include 'src' in the file path if it's part of the actual directory structure.

## Knowledge Management

- Knowledge is stored in `knowledge.md` files, which can be created in relevant directories throughout the project.
- Mani automatically updates knowledge files when learning new information or correcting mistakes.
- Developers are encouraged to review and commit knowledge file changes to share insights across the team.

## Terminal Command Execution

Mani can now execute terminal commands using the `run_terminal_command` tool. This feature allows Mani to perform various tasks such as:

- Searching files with grep
- Installing dependencies
- Running build or test scripts
- Checking versions of installed tools
- Performing git operations
- Creating, moving, or deleting files and directories

## Important Constraints

- **Max Tokens Limit**: The context for Claude AI has a maximum limit of 200,000 tokens. This is an important constraint to consider when designing prompts and managing project file information.

## WebSocket Communication Flow

1. Client connects to the WebSocket server.
2. Client sends user input and file context to the server.
3. Server processes the input using Claude AI.
4. Server streams response chunks back to the client.
5. Client receives and displays the response in real-time.
6. Server sends file changes to the client for application.

## File Versioning System

- The ChatStorage class manages file versions for each chat session.
- Users can navigate between file versions using CTRL+U (undo) and CTRL+R (redo).
- File versions are stored as snapshots of the entire file state at each change.

## Tool Handling System

- Tools are defined in `backend/src/tools.ts` and implemented in `npm-app/src/tool-handlers.ts`.
- Available tools: read_files, scrape_web_page, search_manifold_markets, run_terminal_command.
- The backend uses tool calls to request additional information or perform actions.
- The client-side handles tool calls and sends results back to the server.

## CLI Interface Features

- Non-canonical mode for improved key handling.
- Navigation using arrow keys for input and command history.
- File version control using CTRL+U and CTRL+R.
- ESC key to toggle menu or stop AI response.
- CTRL+C to exit the application.

## Build and Publish Process

- The `prepublishOnly` script runs `clean-package.js` before publishing.
- `clean-package.js` modifies `package.json` to remove unnecessary information.
- The `postpublish` script restores the original `package.json`.
- NODE_ENV is set to 'production' for the published package at runtime.

## Error Handling and Debugging

- The `debug.ts` file provides logging functionality for debugging.
- Error messages are logged to the console and, in some cases, to a debug log file.
- WebSocket errors are caught and logged in the server and client code.

## Security Considerations

- The project uses environment variables for sensitive information (e.g., API keys).
- WebSocket connections should be secured in production (e.g., using WSS).
- User input is validated and sanitized before processing.
- File operations are restricted to the project directory to prevent unauthorized access.

## TODO

- Implement authentication and authorization for WebSocket connections.
- Add more comprehensive error handling and logging.
- Implement rate limiting for AI requests to manage resource usage.
- Create a robust testing suite for all components.

# Code guide

- We don't specify return types for functions, since Typescript will infer them.
- Always include 'src' in file paths when it's part of the actual directory structure, even though imports automatically remove it.

## Python Package

A Python package for Manicode has been created as a skeleton in python-app. Key points:

- It's currently a placeholder that prints a message about the package coming soon and suggests installing the npm version.

- The Python package is intended to be developed further in the future to provide similar functionality to the npm version.

## Version Checking

The Manicode backend implements a version checking mechanism to ensure clients are using the latest version:

1. The client sends its version using the 'check-npm-version' action.
2. The server compares this version with the one in backend/package.json.
3. The server responds with a 'npm-version-status' action, indicating if the client is up-to-date.
4. The backend/package.json version is updated during the build process by the build-version-info.js script, which copies the version from npm-app/package.json.

To maintain correct versioning:

- Always update the version in npm-app/package.json when making releases.
- Run `bun run build` to ensure backend/package.json is updated before deployment.
- Implement proper error handling for version mismatches in both client and server code.
