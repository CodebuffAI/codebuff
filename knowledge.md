# Codebuff

Codebuff is a tool for editing codebases via natural language instruction to Buffy, an expert AI programming assistant.

## Project Goals

1. **Developer Productivity**: Reduce time and effort for common programming tasks
2. **Learning and Adaptation**: Develop a system that learns from user interactions
3. **Focus on power users**: Make expert software engineers move even faster

## Key Technologies

- **TypeScript**: Primary programming language
- **Bun**: Package manager and runtime
- **WebSockets**: Real-time communication between client and server
- **LLMs**: Multiple providers (Anthropic, OpenAI, Gemini, etc.) for various coding tasks

## Main Components

1. **LLM Integration**: Processes natural language instructions and generates code changes
2. **WebSocket Server**: Handles real-time communication between client and backend
3. **File Management**: Reads, parses, and modifies project files
4. **Action Handling**: Processes various client and server actions
5. **Knowledge Management**: Handles creation, updating, and organization of knowledge files
6. **Terminal Command Execution**: Allows running shell commands in user's terminal

## WebSocket Communication Flow

1. Client connects to WebSocket server
2. Client sends user input and file context to server
3. Server processes input using LLMs
4. Server streams response chunks back to client
5. Client receives and displays response in real-time
6. Server sends file changes to client for application

## Tool Handling System

- Tools are defined in `backend/src/tools.ts` and implemented in `npm-app/src/tool-handlers.ts`
- Available tools: read_files, write_file, str_replace, run_terminal_command, code_search, browser_logs, spawn_agents, web_search, read_docs, run_file_change_hooks, and others
- Backend uses tool calls to request additional information or perform actions
- Client-side handles tool calls and sends results back to server
- **Spawned agents can now execute tool calls**: The spawn_agents handler parses tool calls from spawned agent responses and executes them
  - The reviewer agent can run file change hooks directly using the run_file_change_hooks tool
  - Tool calls in spawned agent responses are parsed and executed immediately within the spawn_agents handler
  - Currently supports: run_file_change_hooks, run_terminal_command, code_search, browser_logs
  - Tool calls are executed in the parent agent's context, allowing spawned agents to affect the parent's environment

## CLI Interface Features

- ESC key to toggle menu or stop AI response
- CTRL+C to exit the application

## Package Management

- Use Bun for all package management operations
- Run commands with `bun` instead of `npm` (e.g., `bun install` not `npm install`)
- Use `bun run` for script execution

## Error Handling and Debugging

- The `debug.ts` file provides logging functionality for debugging
- Error messages are logged to console and debug log files
- WebSocket errors are caught and logged in server and client code

## Security Considerations

- Project uses environment variables for sensitive information (API keys)
- WebSocket connections should be secured in production (WSS)
- User input is validated and sanitized before processing
- File operations are restricted to project directory

## Testing Guidelines

- Prefer specific imports over import * to make dependencies explicit
- Exception: When mocking modules with many internal dependencies (like isomorphic-git), use import * to avoid listing every internal function

## Constants and Configuration

Important constants are centralized in `common/src/constants.ts`:
- `CREDITS_REFERRAL_BONUS`: Credits awarded for successful referral
- Credit limits for different user types

## Environment Variables

This project uses [Infisical](https://infisical.com/) for secret management. All secrets are injected at runtime.

**To run any service locally, use the `exec` runner script from root `package.json`**, which wraps commands with `infisical run --`.

Example: `bun run exec -- bun --cwd backend dev`

Environment variables are defined and validated in `packages/internal/src/env.ts`. This module provides type-safe `env` objects for use throughout the monorepo.

### Bun Wrapper Script

The `.bin/bun` script automatically wraps bun commands with infisical when secrets are needed. It prevents nested infisical calls by checking for `NEXT_PUBLIC_INFISICAL_UP` environment variable, ensuring infisical runs only once at the top level while nested bun commands inherit the environment variables.

## Python Package

A Python package skeleton exists in python-app. Currently a placeholder that suggests installing the npm version.

## Project Templates

Codebuff provides starter templates for initializing new projects:

```bash
codebuff --create <template> [project-name]
```

Templates are maintained in the codebuff community repo. Each directory corresponds to a template usable with the --create flag.
