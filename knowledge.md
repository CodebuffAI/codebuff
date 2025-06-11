# Codebuff

Codebuff is a tool for editing codebases via natural language instruction to Buff, an expert AI programming assistant.

## Project Goals

1. **Developer Productivity**: Reduce the time and effort required for common programming tasks, allowing developers to focus on higher-level problem-solving.

2. **Learning and Adaptation**: Develop a system that learns from user interactions and improves its assistance over time.

3. **Focus on power users**: Make expert software engineers move even faster.

## Key Technologies

- **TypeScript**: The primary programming language used throughout the project.
- **Node.js**: The runtime environment for executing the application.
- **WebSockets**: Used for real-time communication between the client and server.
- **LLM's**: Different LLM providers (Anthropic, OpenAI, Gemini, etc.) are used for various coding sub-problems on the backend.

## Main Components

1. **LLM Integration**: Processes natural language instructions and generates code changes.
2. **WebSocket Server**: Handles real-time communication between the client and the backend.
3. **File Management**: Reads, parses, and modifies project files.
4. **Action Handling**: Processes various client and server actions.
5. **Message History**: Manages conversation history
6. **Knowledge Management**: Handles the creation, updating, and organization of knowledge files.
7. **Terminal Command Execution**: Allows running shell commands in the user's terminal.

## Important Constraints

- **Max Tokens Limit**: The context for Claude AI has a maximum limit of 200,000 tokens. This is an important constraint to consider when designing prompts and managing project file information.

## WebSocket Communication Flow

1. Client connects to the WebSocket server.
2. Client sends user input and file context to the server.
3. Server processes the input using Claude AI.
4. Server streams response chunks back to the client.
5. Client receives and displays the response in real-time.
6. Server sends file changes to the client for application.

## Tool Handling System

- Tools are defined in `backend/src/tools.ts` and implemented in `npm-app/src/tool-handlers.ts`.
- Available tools: read_files, scrape_web_page, search_manifold_markets, run_terminal_command.
- The backend uses tool calls to request additional information or perform actions.
- The client-side handles tool calls and sends results back to the server.

## CLI Interface Features

- ESC key to toggle menu or stop AI response.
- CTRL+C to exit the application.

## Build and Publish Process

- The `prepublishOnly` script runs `clean-package.js` before publishing.
- `clean-package.js` modifies `package.json` to remove unnecessary information.
- The `postpublish` script restores the original `package.json`.
- NODE_ENV is set to 'production' for the published package at runtime.
- Project uses Bun as the package manager - always use `bun` commands instead of `npm`

## Package Management

- Use Bun for all package management operations
- Run commands with `bun` instead of `npm` (e.g., `bun install` not `npm install`)
- Use `bun run` for script execution
- Project uses Bun as the package manager - always use `bun` commands instead of `npm`
- Project uses Bun as the package manager - always use `bun` commands instead of `npm`

## Package Management

- Use Bun for all package management operations
- Run commands with `bun` instead of `npm` (e.g., `bun install` not `npm install`)
- Use `bun run` for script execution

## Error Handling and Debugging

- The `debug.ts` file provides logging functionality for debugging.
- Error messages are logged to the console and, in some cases, to a debug log file.
- WebSocket errors are caught and logged in the server and client code.

## Security Considerations

- The project uses environment variables for sensitive information (e.g., API keys).
- WebSocket connections should be secured in production (e.g., using WSS).
- User input is validated and sanitized before processing.
- File operations are restricted to the project directory to prevent unauthorized access.

## Testing Guidelines

- Prefer specific imports over import * to make dependencies explicit and improve maintainability
- Exception: When mocking modules that have many internal dependencies (like isomorphic-git), it may be cleaner to use import * to avoid having to list every internal function that might be called

## Constants and Configuration

Important constants and configuration values are centralized in `common/src/constants.ts`. This includes:

- `CREDITS_REFERRAL_BONUS`: The number of credits awarded for a successful referral.
- `CREDITS_USAGE_LIMITS`: Defines credit limits for different user types (ANON, FREE, PAID).

Centralizing these constants makes it easier to manage and update project-wide settings.

## Environment Variables

This project uses [Infisical](https://infisical.com/) for secret management. All secrets are injected at runtime.

**To run any service locally, you must use the `exec` runner script from the root `package.json`**, which wraps the command with `infisical run --`.

Example: `bun run exec -- bun --cwd backend dev`

All environment variables are defined and validated in the central `env/index.ts` module. This module provides type-safe `env` and `clientEnv` objects for use throughout the monorepo.

## Python Package

A Python package for Codebuff has been created as a skeleton in python-app. Key points:

- It's currently a placeholder that prints a message about the package coming soon and suggests installing the npm version.

## Build System Notes

The project uses Nx for build management and caching. Some important notes:

- Nx maintains a SQLite cache database to speed up subsequent builds
- The cache can become corrupted in certain scenarios:
  - Sudden process termination during builds
  - Multiple Nx processes writing simultaneously
  - Disk errors or space issues
  - System crashes
- If you see `database disk image is malformed` errors, run `npx nx reset` to clear the cache
- Don't include `nx reset` in build scripts as it defeats the purpose of incremental builds
- The reset command should be used as a troubleshooting step only

## Project Templates

Codebuff provides starter templates that can be used to initialize new projects:

```bash
codebuff --create <template> [project-name]
```

Templates are maintained in the [codebuff community repo](https://github.com/CodebuffAI/codebuff-community). Each directory in the starter-templates and showcase directories corresponds to a template that can be used with the --create flag.

Example template:

- nextjs: Next.js starter template
