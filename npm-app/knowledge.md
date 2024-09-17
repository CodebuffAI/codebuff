# Manicode Project Structure

## Overview

Manicode is an AI-powered development assistant that runs from the command line. It has access to all files in your project and can carry out various tasks.

## Project Structure

### Root Directory

- `package.json`: Defines the project dependencies, scripts, and metadata.
- `tsconfig.json`: TypeScript configuration file.
- `README.md`: Project documentation and usage instructions.

### Source Code (`src/`)

The `src/` directory contains the main TypeScript source files:

- `index.ts`: Entry point of the application. Sets up the main `manicode` function.
- `chat-client.ts`: Implements the `ChatClient` class for handling WebSocket communication.
- `config.ts`: Contains configuration-related functions and constants.
- `chat-storage.ts`: Manages chat storage functionality.
- `cli.ts`: Implements the Command Line Interface.
- `project-files.ts`: Handles project file operations.

### Build Output (`dist/`)

The `dist/` directory contains the compiled JavaScript files and is created during the build process.

## Project File Handling

- Manny can only view files that are not gitignored. This is partially to save tokens when we list out all the files.
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

Manicode can be started by running the `manicode` command in the terminal after installation. It provides a menu interface (accessible by pressing `Esc`) and allows navigation through file versions using arrow keys.

## Knowledge Management

Manicode encourages storing knowledge alongside code using `knowledge.md` files. These files provide context, guidance, and tips for the AI as it performs tasks.

## Build and Publish Process

When publishing the Manicode package, we use a custom process to ensure that only necessary information is included in the published package and that the environment is set correctly:

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

Manicode uses Bun as its package manager. Always use Bun commands for managing dependencies instead of npm.

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

These changes aim to provide a more intuitive and familiar experience for users while maintaining the unique features of Manicode.

## Note on Project Evolution

As an AI-powered tool, Manicode is designed to learn and evolve. It can update knowledge files as it works, improving its understanding and capabilities over time.

## WebSocket Communication

The `Client` class in `client.ts` manages WebSocket communication with the server:

- Connects to the WebSocket server specified in the configuration.
- Sends user input and receives responses from the AI.
- Handles tool calls and their responses.
- Manages the response stream, allowing for real-time updates and the ability to stop ongoing responses.

## File Management

The `project-files.ts` module handles all file-related operations:

- Reads and writes files within the project directory.
- Traverses the project structure, respecting `.gitignore` files.
- Applies changes to files based on AI suggestions.
- Manages file versioning for undo/redo functionality.

## Tool Handlers

The `tool-handlers.ts` file implements handlers for various tools:

- `read_files`: Reads contents of specified files.
- `scrape_web_page`: Retrieves content from a given URL.
- `search_manifold_markets`: Searches for relevant prediction markets.
- `run_terminal_command`: Executes shell commands in the user's terminal.

These tools extend Manicode's capabilities, allowing it to gather information and perform actions beyond simple code manipulation.

## Error Handling

Error handling is implemented throughout the application:

- WebSocket connection errors are caught and logged.
- File read/write errors are handled gracefully.
- Tool execution errors are captured and reported back to the AI.

Developers should continue to improve error handling to ensure a smooth user experience and easier debugging.

## Security Considerations

- The application runs commands in the user's terminal, which could potentially be dangerous. Users should be cautious when using Manicode on sensitive projects.
- File operations are restricted to the project directory to prevent unauthorized access to the user's system.
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
- Users are instructed to update using the command: `npm install -g manicode`
- The version check is performed as part of the WebSocket subscription setup.

## End of Document
