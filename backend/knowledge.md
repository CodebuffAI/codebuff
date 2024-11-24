# Codebuff Backend

This document provides an overview of the Codebuff backend architecture, key components, and important concepts.

## Architecture Overview

The Codebuff backend is built on Node.js using TypeScript. It uses an Express server for HTTP requests and a WebSocket server for real-time communication with clients. The backend integrates with the Claude AI model to process user inputs and generate code changes.

## Key Technologies

- **TypeScript**: The primary language used for backend development.
- **Node.js**: The runtime environment for executing the backend server.
- **Express**: Web application framework for handling HTTP requests.
- **WebSocket (ws)**: Library for real-time, bidirectional communication.
- **Anthropic AI SDK**: Used for integrating with the Claude AI model.

## Main Components

1. **Express Server (index.ts)**: The main entry point for the backend application.

2. **WebSocket Server (websockets/server.ts)**: Handles real-time communication with clients.

3. **Claude Integration (claude.ts)**: Provides functions for interacting with the Claude AI model.

4. **Main Prompt Handler (main-prompt.ts)**: Processes user inputs and manages file changes.
   Key features:
   - Smart conversation flow management
   - Progress detection to avoid infinite loops
   - Graceful pause/continue handling when STOP_MARKER is reached
   - Uses GPT-4 Mini for quick classification of conversation state

5. **System Prompt Generator (system-prompt.ts)**: Creates initial prompt with project context.

6. **File Diff Generation**: Generates diffs for file changes and handles expansion.

7. **Relevant File Request**: Determines which files are relevant for user requests.

## Conversation Flow Management

The system uses a multi-layered approach to manage conversation flow:

1. **Progress Detection**: When handling unbounded iterations, the system periodically checks if:
   - The user's request has been satisfied
   - The conversation is stuck in a loop
   - No meaningful progress is being made

2. **Smart Continuation**: 
   - Uses Claude Sonnet with agent system prompt for conversation state decisions
   - Ensures consistent context and quality by using same model as main conversation
   - If progress is satisfactory, gracefully stops
   - If more work needed, continues with clear context
   - Checks progress when STOP_MARKER is reached

3. **Client-Server Coordination**:
   - Uses tool calls to delegate continuation decisions to client
   - Server sends 'continue' tool call instead of continuing server-side
   - Maintains client control over conversation flow
   - Allows client to check in between iterations

## File Management

The backend handles file operations for the Codebuff project:

- **Reading Files**: The `read_files` tool allows the AI to access project file contents.
- **Applying Changes**: The `applyChanges` function processes and applies file modifications.
- **Diff Format**: Uses git-style diff markers for code changes:
  ```
  <<<<<<< SEARCH
  old code
  =======
  new code
  >>>>>>> REPLACE
  ```
  This format aligns with git's diff style for familiarity and consistency. Always use the `createSearchReplaceBlock` helper function to generate these blocks rather than writing the markers directly:
  ```ts
  createSearchReplaceBlock(oldCode, newCode)
  ```

  Important whitespace handling rules:
  - Preserve all whitespace in search/replace blocks, including leading/trailing newlines.
  - Do not strip or normalize whitespace as it may be significant for matching.
  - Match exact whitespace when possible before falling back to whitespace-insensitive matching.

## Web Scraping

The backend includes a web scraping tool that allows the AI assistant to retrieve content from external web pages:

- **Tool Name**: `scrape_web_page`
- **Input**: A URL of the web page to scrape.
- **Output**: The content of the scraped web page.

## Debugging and Logging

- Avoid adding logging statements directly to utility functions in the `common/` directory.
- Prefer to add logging in the calling functions within the `backend/` directory.
- When investigating issues, focus on adding temporary logging to the relevant backend functions.

## Error Handling and Quota Management

### Quota Exceeded Errors

When a user exceeds their quota, the error message returned includes the current usage information:

- The `protec` middleware in `websockets/middleware.ts` handles quota checks.
- For both authenticated and anonymous users, when quota is exceeded:
  1. Retrieve current usage: `const { usage, limit } = await quotaManager.checkQuota(id)`.
  2. Include usage in error message: `return getUsageInfo(true, fingerprintId, userId)`.

## Tool Handling

The backend implements a tool handling system that allows the AI assistant to perform various actions:

1. **Tool Definition**: Tools are defined in `tools.ts`.
2. **Tool Implementation**: All tool handlers must be implemented in `npm-app/src/tool-handlers.ts`.
3. **Available Tools**: read_files, scrape_web_page, search_manifold_markets, run_terminal_command.
4. **Tool Execution**: Backend processes tool calls and provides results back to AI.

### Change Tracking During Tool Calls

Important: Changes made during tool execution must be properly tracked:
- Changes made before a tool call are marked as "already applied".
- Tool handlers must pass their changes back to server as changesAlreadyApplied.
- Final response includes all previously applied changes before tool calls and any changes in the last assistant response.
- The client shows the diff from all the changes.

## AI Response Handling

When cleaning responses from AI models:
- Always handle markdown code blocks with language tags (e.g. ```typescript).
- Strip both the opening and closing backticks and any language identifier.
- Preserve the actual code content exactly as returned.
- Example: "```typescript\ncode\n```" should become just "code\n".

## Code Changes and Refactoring

1. **Thoroughness**: When updating function calls or patterns:
   - Search entire codebase for all instances.
   - Check both direct calls and indirect uses.
   - Verify each file that imports the changed code.
   - Double-check files that were already modified for missed instances.
   - When changing function signatures, be especially careful to find all call sites.
   - Consider using grep or your IDE's find-all-references feature to ensure complete coverage.

2. **Async Operations**:
   - Prefer non-blocking operations for auxiliary checks that don't affect core flow.
   - Use OpenAI's mini models for quick classification tasks.
   - Extract reusable prompting logic into separate functions at file bottom.
   - Keep main logic flow clear by moving implementation details down.
   - Import model constants from common/constants.ts instead of hardcoding.

## Recent Updates

1. **Error Handling Improvements**:
   - Updated error messages in the `protec` middleware to include more helpful information.
   - Changed return type of middleware functions from `Error` to `ServerAction`.

2. **Usage Information Refactoring**:
   - Renamed `sendUsageInfo` to `getUsageInfo` in `websocket-action.ts`.
   - Modified `getUsageInfo` to return a usage response object.
   - Updated usage-response action schema to include showUser boolean field.

3. **Environment Configuration**:
   - Added `NEXT_PUBLIC_SUPPORT_EMAIL` to environment variables.

4. **CLI Enhancements**:
   - Improved formatting of welcome message in CLI.

Remember to keep this knowledge file updated as the application evolves.
