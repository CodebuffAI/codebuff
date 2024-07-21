
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

## Key Components

1. **ChatClient**: Manages WebSocket communication with the server, handles subscriptions, and processes messages.

2. **ChatStorage**: Responsible for storing and managing chat data.

3. **CLI**: Implements the command-line interface for user interaction.

4. **Config**: Handles environment variables and configuration settings.

## Build Process

The build process is defined in `package.json`:

1. Builds the `common` project (located in a sibling directory).
2. Builds the `manicode` project using TypeScript.
3. Copies necessary files from the `common` project and the current project to the `dist/` directory.

## Dependencies

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

## Note on Project Evolution

As an AI-powered tool, Manicode is designed to learn and evolve. It can update knowledge files as it works, improving its understanding and capabilities over time.

