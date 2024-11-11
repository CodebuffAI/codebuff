# Codebuff Project Structure

## Overview

Codebuff is an AI-powered development assistant that runs from the command line. It has access to all files in your project and can carry out various tasks.

## Project Structure

### Root Directory

- `package.json`: Defines the project dependencies, scripts, and metadata.
- `tsconfig.json`: TypeScript configuration file.
- `README.md`: Project documentation and usage instructions.

### Source Code (`src/`)

The `src/` directory contains the main TypeScript source files:

- `index.ts`: Entry point of the application. Sets up the main `codebuff` function.
- `chat-client.ts`: Implements the `ChatClient` class for handling WebSocket communication.
- `config.ts`: Contains configuration-related functions and constants.
- `chat-storage.ts`: Manages chat storage functionality.
- `cli.ts`: Implements the Command Line Interface.
- `project-files.ts`: Handles project file operations.

### Build Output (`dist/`)

The `dist/` directory contains the compiled JavaScript files and is created during the build process.

## Project File Handling

- Buffy can only view files that are not gitignored. This is partially to save tokens when we list out all the files.
- Multiple `.gitignore` files can exist throughout the project structure.
- When traversing the project structure, we need to accumulate and apply ignore patterns from all encountered `.gitignore` files.

## Key Components

1. **ChatClient**: Manages WebSocket communication with the server, handles subscriptions, and processes messages.

2. **ChatStorage**: Responsible for storing and managing chat data.

3. **CLI**: Implements the command-line interface for user interaction.

4. **Config**: Handles environment variables and configuration settings.

## Build Process

The build process is defined in `package.json`:

1. Builds the `common` project (located in a sibling directory).
2. Builds the `npm-app` project using TypeScript.
3. Copies necessary files from the `common` project and the current project to the `dist/` directory.

## Dependencies

- ts-pattern: Used for pattern matching in TypeScript. Installed to improve type safety and readability when checking message types.

- The project depends on a `common` package (version 1.0.0) which is likely a shared library.
- Uses `lodash` for utility functions.
- TypeScript is used for development.

## TypeScript Configuration

- The project uses CommonJS modules.
- Strict type checking is enabled.
- The `common/*` path is mapped to `../common/dist/*` for importing shared components.

## Usage

Codebuff can be started by running the `codebuff` command in the terminal after installation. It provides a menu interface (accessible by pressing `Esc`) and allows navigation through file versions using arrow keys.

## Knowledge Management

Codebuff encourages storing knowledge alongside code using `knowledge.md` files. These files provide context, guidance, and tips for the AI as it performs tasks.

## Build and Publish Process

When publishing the Codebuff package, we use a custom process to ensure that only necessary information is included in the published package and that the environment is set correctly:

1. The `prepublishOnly` script runs `clean-package.js` before publishing.
2. `clean-package.js` does the following:
   - Saves the current `package.json` to `temp.package.json`.
   - Modifies the original `package.json` by removing `devDependencies`, `peerDependencies`, and unnecessary `scripts`.
   - Writes the modified `package.json` back to its original location.
   - Adds `process.env.NODE_ENV = 'production';` as the second line of `dist/index.js`.
3. npm publishes the package using the modified `package.json`.
4. The `postpublish` script restores the original `package.json` from `temp.package.json` and then deletes the temporary file.

This approach ensures that:

- The published package only includes necessary dependencies and scripts.
- The development environment remains intact after publishing.
- NODE_ENV is set to 'production' for the published package at runtime.

To publish the package:

```bash
npm publish
```

This will automatically run the `prepublishOnly` and `postpublish` scripts to handle the `package.json` modifications, environment setting, and cleanup.

Remember to increment the version number in `package.json` before publishing a new version.

## Package Management

Codebuff uses Bun as its package manager. Always use Bun commands for managing dependencies instead of npm.

Key points:

- Use `bun add <package-name>` to install new packages.
- Use `bun remove <package-name>` to remove packages.
- Use `bun install` to install all dependencies after cloning the repository.

## CLI Functionality

The CLI (Command Line Interface) has been updated to provide a more standard terminal experience:

1. **Input Handling**: Uses the `readline` module for improved key handling.
2. **Navigation**:
   - Left and right arrow keys move the cursor within the input.
   - Up and down arrow keys navigate through command history.
3. **File Version Control**:
   - `Ctrl+U`: Undo file changes (navigate to previous version)
   - `Ctrl+R`: Redo file changes (navigate to next version)
4. **Application Control**:
   - `Ctrl+C`: Exit the application
   - `Esc`: Toggle menu or stop the current AI response
5. **Input Submission**: Press Enter to submit the current input.
6. **Diff Command**: A new "diff" command is planned to show changes from the last assistant response.

### Auto-Git Feature

- Use the `--auto-git` flag when running Codebuff to automatically stage all changes before applying new changes from user input.
- Implement git operations using `execSync` from the `child_process` module for synchronous execution.
- Provide visual feedback (green text) when changes are staged.

Example implementation:

```typescript
import { execSync } from 'child_process'
import { green } from 'picocolors'

// In the CLI class
private stageAllChanges() {
  execSync('git add .')
  console.log(green('All changes staged'))
}
```
These changes aim to provide a more intuitive and familiar experience for users while maintaining the unique features of Codebuff.

## Note on Project Evolution

As an AI-powered tool, Codebuff is designed to learn and evolve. It can update knowledge files as it works, improving its understanding and capabilities over time.

## WebSocket Communication

The `Client` class in `client.ts` manages WebSocket communication with the server:

- Connects to the WebSocket server specified in the configuration.
- Sends user input and receives responses from the AI.
- Handles tool calls and their responses.
- Manages the response stream, allowing for real-time updates and the ability to stop ongoing responses.

## File Management

The `project-files.ts` module handles all file-related operations:

- Buffy can only view files that are not gitignored. This is partially to save tokens when we list out all the files.
- Reads and writes files within the project directory.
- Traverses the project structure, respecting `.gitignore` files.
- Applies changes to files based on AI suggestions.
- Manages file versioning for undo/redo functionality.

### Recently Accessed Files

The project now includes functionality to track recently accessed files. This feature has been added to the project file context, which maintains a list of the file paths for the last 10 read files. This can be useful for:

1. Implementing a "recently opened files" feature in the user interface.
2. Optimizing file loading by prioritizing recently accessed files.
3. Providing context to the AI assistant about which files the user has been working with recently.

Implementation details:
- The project file context should be updated to include an array of the last 10 accessed file paths.
- When reading files, the list should be updated to reflect the most recently accessed files.
- This list should be maintained in memory and does not need to persist between sessions.

Note: This feature focuses on tracking recently accessed files, rather than storing the last access time of each file. It provides a more holistic view of user activity within the project.

## Tool Handlers

The `tool-handlers.ts` file implements handlers for various tools:

- `read_files`: Reads contents of specified files.
- `scrape_web_page`: Retrieves content from a given URL.
- `run_terminal_command`: Executes shell commands in the user's terminal.

These tools extend Codebuff's capabilities, allowing it to gather information and perform actions beyond simple code manipulation.

## Error Handling

Error handling is implemented throughout the application:

- WebSocket connection errors are caught and logged.
- File read/write errors are handled gracefully.
- Tool execution errors are captured and reported back to the AI.

Developers should continue to improve error handling to ensure a smooth user experience and easier debugging.

## Security Considerations

- The application runs commands in the user's terminal, which could potentially be dangerous. Users should be cautious when using Codebuff on sensitive projects.
- File operations are restricted to the project directory to prevent unauthorized access to the user's system.
- Web scraping and external API calls (e.g., Manifold Markets) should be used responsibly and in compliance with the respective services' terms of use.

## Referral System

The referral system is integrated directly into the CLI application:

- Users enter referral codes as regular input in the CLI.
- The system detects input with the prefix "ref-" as a referral code.
- When a referral code is detected, the system automatically initiates a login-code-request with the entered referral code.
- The referral code is appended as a query parameter to the login link.
- This process seamlessly combines referral code entry with the user authentication flow.

Implementation notes:
- Modify the handleUserInput function in cli.ts to detect "ref-" prefixed input.
- Update the login flow in client.ts to include the referral code when present.
- Ensure the backend (websocket-action.ts) appends the referral code to the login link as a query parameter.
- Web scraping and external API calls (e.g., Manifold Markets) should be used responsibly and in compliance with the respective services' terms of use.

## Future Improvements

1. Implement user authentication for the WebSocket connection.
2. Add more robust error handling and user-friendly error messages.
3. Implement a caching system for frequently accessed files to improve performance.
4. Create a comprehensive test suite to ensure reliability across different environments.
5. Enhance the CLI with more features, such as chat history browsing and export/import functionality.

## User Input ID System

1. Each user input generates a unique user input ID (using nanoid) on the client-side.
2. The user input ID is passed to the server with the user input.
3. All related responses, including tool calls and response chunks, include this user input ID.
4. The user input ID remains consistent for all interactions related to a single user input.

This system allows for better tracking and correlation of user inputs with their corresponding responses and tool calls, while avoiding potential conflicts with individual message IDs.

## Version Checking

- The `Client` class in `client.ts` includes a subscription to 'npm-version-status' that checks if the current version is up to date.
- If a newer version is available, a warning is displayed in yellow text.
- Users are instructed to update using the command: `npm install -g codebuff`
- The version check is performed as part of the WebSocket subscription setup.

### Usage Warnings and Referral System

The client now integrates usage warnings with the referral system to encourage user growth:

- The 'usage-response' action from the backend includes a 'referralLink' field.
- This referral link is displayed to logged-in users who haven't made more than 5 referrals yet.
- The `showUsageWarning` function in the client displays this referral link alongside the usage warning.

This feature combines user authentication, referral tracking, and usage monitoring to promote user acquisition through the CLI interface.

## User Notifications

### Usage Warnings
## User Notifications

### Usage Warnings

- Warn users about their usage at specific thresholds: 25%, 50%, 75%, and 100% of their monthly limit.
- Avoid frequent notifications to prevent spamming users with upgrade requests.
- Implementation should be in the `Client` class in `src/client.ts`.
- Only display a warning when a new threshold is reached, not for every percentage increase.

## Performance Optimizations

### Asynchronous Operations

When dealing with potentially time-consuming operations (like generating commit messages) that are part of a larger process, consider starting these operations early and awaiting their results later in the process. This approach can help reduce overall processing time and improve responsiveness.

Example: In the auto-commit feature, start generating the commit message before sending the user input request, then await its completion before applying further changes:

```typescript
// Start commit message generation early
const commitMessagePromise = this.client.generateCommitMessage(stagedChanges);

// Perform other operations...

// Await the commit message when needed
const commitMessage = await commitMessagePromise;
```

This technique can be applied to various scenarios where asynchronous operations can be started early in the process flow.

## Code Style

### Variable Updates
- Prefer direct variable updates over helper methods for simple operations
- Example: For incrementing counters or updating simple state, use direct assignment rather than creating setter methods
- This keeps the code simpler and reduces unnecessary abstraction

## End of Document

## Logging and Debugging

- Use minimal logging in production code.
- Avoid adding excessive console.log statements for debugging purposes in committed code.
- For debugging, use temporary logging statements or debugging tools, but remove them before committing changes.
- When adding logs, focus on capturing essential information that provides meaningful insights into the application's behavior or performance.

- In non-production environments, all logs are appended to a 'debug.log' file for easier debugging and troubleshooting.
