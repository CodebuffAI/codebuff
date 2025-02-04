# Codebuff Backend

This document provides an overview of the Codebuff backend architecture, key components, and important concepts.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Key Technologies](#key-technologies)
3. [Main Components](#main-components)
4. [WebSocket Communication](#websocket-communication)
5. [Claude Integration](#claude-integration)
6. [File Management](#file-management)
7. [Tool Handling](#tool-handling)
8. [Error Handling and Debugging](#error-handling-and-debugging)
9. [Build and Deployment](#build-and-deployment)
10. [Security Considerations](#security-considerations)
11. [TODO List](#todo-list)
12. [User Quota and Billing](#user-quota-and-billing)
13. [Automatic URL Detection and Scraping](#automatic-url-detection-and-scraping)

## Development Workflow

### Platform-Specific Considerations

Windows developers may encounter different behavior with:
- TypeScript configuration and type resolution:
  - Use forward slashes in all paths
  - Add both local and root node_modules to typeRoots: `["./node_modules/@types", "../node_modules/@types"]`
  - Node.js types and Bun types may need different resolution strategies
  - When using __dirname or path.join(), convert Windows backslashes to forward slashes
  - Do not exclude .mjs files in tsconfig.json - TypeScript needs to process them for proper module resolution
- Module resolution may require explicit paths in tsconfig.json
- Some type packages must be installed at both root and package level

### Hot Reloading

The project uses hot reloading to improve development efficiency. This is implemented for both the backend and npm-app:

1. Backend:
   - Uses Bun's built-in watch functionality to monitor both `backend/src` and `common/src` directories.
   - Run with `bun run dev` in the backend directory.

2. npm-app:
   - Similar setup to the backend, watching both `npm-app/src` and `common/src`.
   - Run with `bun run dev` in the npm-app directory.

This setup ensures consistent development practices across different parts of the project, allowing for immediate feedback on code changes.


## Architecture Overview

The Codebuff backend is built on Node.js using TypeScript. It uses an Express server for HTTP requests and a WebSocket server for real-time communication with clients. The backend integrates with the Claude AI model to process user inputs and generate code changes.

## Key Technologies

- **TypeScript**: The primary language used for backend development.
- **Node.js**: The runtime environment for executing the backend server.
- **Express**: Web application framework for handling HTTP requests.
- **WebSocket (ws)**: Library for real-time, bidirectional communication between client and server.
- **Anthropic AI SDK**: Used for integrating with the Claude AI model.

## Main Components

1. **Express Server (index.ts)**: The main entry point for the backend application. It sets up the Express server and initializes the WebSocket server.

2. **WebSocket Server (websockets/server.ts)**: Handles real-time communication with clients. It manages connections, message parsing, and routing of WebSocket messages.

3. **Claude Integration (claude.ts)**: Provides functions for interacting with the Claude AI model, including streaming responses and handling tool calls.

4. **Main Prompt Handler (main-prompt.ts)**: Processes user inputs, generates responses, and manages file changes and tool calls. Key features:
   - Smart conversation flow management
   - Progress detection to avoid infinite loops
   - Graceful pause/continue handling when STOP_MARKER is reached
   - Uses GPT-4 Mini for quick classification of conversation state

5. **System Prompt Generator (system-prompt.ts)**: Creates the initial prompt for the AI assistant with project-specific context and instructions.

6. **File Diff Generation (generate-diffs-prompt.ts, generate-diffs-via-expansion.ts)**: Generates diffs for file changes and handles expansion of shortened file content.

7. **Relevant File Request (request-files-prompt.ts)**: Determines which files are relevant for a given user request.

8. **Tools Definition (tools.ts)**: Defines the available tools that can be used by the AI assistant.

## WebSocket Communication

The backend uses WebSockets for real-time, bidirectional communication with clients. Key concepts include:

- **Message Types**: Various message types (e.g., 'identify', 'subscribe', 'action') for different operations.
- **Action Handling**: The `websocket-action.ts` file processes incoming action messages and triggers appropriate responses.
- **Subscription Management**: Clients can subscribe to specific topics for targeted updates.

## WebSocket Communication Flow

1. Client connects to the WebSocket server.
2. Client sends user input and file context to the server.
3. Server processes the input using Claude AI.
4. Server streams response chunks back to the client.
5. Client receives and displays the response in real-time.
6. Server sends file changes to the client for application.

## Conversation Flow Management

The system uses a multi-layered approach to manage conversation flow:

1. **Progress Detection**: When handling unbounded iterations (e.g., "do all cases"), the system periodically checks if:
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

This architecture prevents infinite loops while allowing productive work to continue, and ensures the client maintains control over the conversation flow.

## Claude Integration

The backend integrates with the Claude AI model to process user inputs and generate code changes. Important aspects include:

- **Streaming Responses**: Responses from Claude are streamed in real-time to the client.
- **Tool Calls**: The AI can make tool calls (e.g., reading files) during its processing.
- **File Change Management**: The backend processes AI-suggested file changes and applies them to the project.

## File Management

The backend handles file operations for the Codebuff project:

- **Reading Files**: The `read_files` tool allows the AI to access project file contents.
- **Applying Changes**: The `applyChanges` function in `prompts.ts` processes and applies file modifications suggested by the AI.
- **Path Requirements**: File paths must:
  - Not start with '/' (strip leading slashes)
  - Be relative to project root
  - Not contain '..' segments
  - Not be absolute paths
- **File Tree Truncation**: When showing file tree to AI:
  - First tries showing full tree with token counts
  - If too large, removes token counts only
  - If still too large, removes unimportant files (build artifacts, cache)
  - Finally removes files starting from deepest directories
  - AI is informed which truncation level was applied
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
  - Preserve all whitespace in search/replace blocks, including leading/trailing newlines
  - Do not strip or normalize whitespace as it may be significant for matching
  - Match exact whitespace when possible before falling back to whitespace-insensitive matching

## Web Scraping

The backend now includes a web scraping tool that allows the AI assistant to retrieve content from external web pages. This functionality is useful for gathering information from documentation, APIs, or other web-based resources.

- **Tool Name**: `scrape_web_page`
- **Input**: A URL of the web page to scrape
- **Output**: The content of the scraped web page

## Debugging and Logging

- Avoid adding logging statements directly to utility functions in the `common/` directory.
- Prefer to add logging in the calling functions within the `backend/` directory.
- When investigating issues, focus on adding temporary logging to the relevant backend functions rather than modifying shared utility functions.

## Error Handling and Debugging

- Avoid adding logging statements directly to utility functions in the `common/` directory.
- Prefer to add logging in the calling functions within the `backend/` directory.
- When investigating issues, focus on adding temporary logging to the relevant backend functions rather than modifying shared utility functions.

## API Error Handling

- Only retry on connection errors (type "APIConnectionError") for most APIs
- Other error types indicate issues that won't be resolved by retrying
- Exception: Deepseek API rarely errors but can be very slow
  - Use timeouts (2min) with retries rather than waiting indefinitely
  - Only retry on timeout errors, not API errors

## Message Storage

### Screenshot Handling
- Screenshots from tool results are converted to image blocks
- Screenshots can come from two sources:
  1. Tool result objects with screenshot field
  2. String content containing JSON with screenshot field
- Transform messages immediately when receiving user input in websocket-action.ts
- This ensures consistent handling regardless of later processing steps
- Different formatting for Anthropic vs OpenAI:
  - Anthropic: Always use ephemeral caching to avoid token overhead
  - OpenAI: Use ephemeral for large images (>200KB)
- Image blocks follow provider-specific formats:
  ```typescript
  {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/jpeg',
      data: string // base64 data
    },
    cache_control?: {
      type: 'ephemeral'
    }
  }
  ```

Important: When saving messages from Claude API:
- Use fire-and-forget pattern for non-critical storage operations
- Wrap async operations in withLoggerContext to preserve logging context
- Handle errors without blocking the main flow
- Log errors but don't re-throw for non-critical operations
- Example pattern:
  ```typescript
  withLoggerContext(
    { contextData },
    () => saveOperation().catch(error => {
      logger.error({ error }, 'Operation failed')
    })
  )
  ```

### Stream Event Handling
- Message events come in order: message_start → content_block_start → content_block_delta → message_delta
- Track message state in a single object for consistency
- Save messages when stream ends AND content was received
- Don't rely solely on final usage stats - update stats whenever available
- Always verify messageId exists before saving
- Usage stats can come in multiple chunks - accumulate throughout stream
- Content receipt is more important than final usage stats for saving

### Message Transformation
- Transform messages immediately when receiving user input in websocket-action.ts
- Do not transform messages again in main-prompt.ts or other downstream functions
- This ensures consistent handling regardless of later processing steps
- Prefer transforming individual messages over arrays of messages:
  - Makes the transformation logic clearer and more focused
  - Easier to test individual cases
  - Use map() to transform arrays of messages when needed
- Keep transformers simple and focused:
  - Use const assertions for literal types to ensure type safety
  - Split complex transformations into smaller, focused functions
  - Handle edge cases explicitly rather than with complex logic
  - Prefer immutable transformations that return new objects

## AI Response Handling

When cleaning responses from AI models:
- Always handle markdown code blocks with language tags (e.g. ```typescript)
- Strip both the opening and closing backticks and any language identifier
- Preserve the actual code content exactly as returned
- Example: "```typescript\ncode\n```" should become just "code\n"
- This pattern appears in process-file-block.ts and other files that process AI responses

## Code Changes and Refactoring

1. **Thoroughness**: When updating function calls or patterns:
   - Search entire codebase for all instances
   - Check both direct calls and indirect uses
   - Verify each file that imports the changed code
   - Double-check files that were already modified for missed instances
   - When changing function signatures, be especially careful to find all call sites
   - Consider using grep or your IDE's find-all-references feature to ensure complete coverage

2. **Async Operations**:
   - Prefer non-blocking operations for auxiliary checks that don't affect core flow
   - Use OpenAI's mini models for quick classification tasks (e.g., detecting user intent)
   - Extract reusable prompting logic into separate functions at file bottom
   - Keep main logic flow clear by moving implementation details down
   - Import model constants from common/constants.ts instead of hardcoding

## Build and Deployment

1. **Build Process**: The backend uses TypeScript compilation to build the project.
2. **Docker Support**: A Dockerfile is provided for containerization of the backend.
3. **Deployment Script**: The `deploy.sh` script automates the build and deployment process to Google Cloud Platform.

## Security Considerations

1. **Environment Variables**: Sensitive information (e.g., API keys) is stored in environment variables.
2. **Input Validation**: User input is validated and sanitized before processing.
3. **File Access Restrictions**: File operations are restricted to the project directory to prevent unauthorized access.

## TODO List

1. Implement authentication and authorization for WebSocket connections.
2. Add more comprehensive error handling and logging.
3. Implement rate limiting for AI requests to manage resource usage.
4. Create a robust testing suite for backend components.
5. Optimize the file diff generation process for better reliability and performance.

## User Quota and Billing

### Usage Limit Handling

- The system tracks user usage and compares it against their quota limit.
- Warning messages are shown at 25%, 50%, and 75% of the usage limit.
- When a user reaches or exceeds 100% of their usage limit:
  - An error message MUST ALWAYS be displayed to the user.
  - This error message should inform the user that they've reached their monthly limit.
  - For logged-in users, provide a link to the pricing page for upgrades.
  - For anonymous users, prompt them to log in for more credits.
  - If available, include a referral link for additional credits.


## Referral System

The referral system is an important feature of our application. Here are key points to remember:

1. **Referral Limit**: Users are limited to a maximum number of successful referrals (currently set to 5).

2. **Limit Enforcement**: The referral limit must be enforced during the redemption process (POST request), not just when displaying referral information (GET request).

3. **Centralized Logic**: The `hasMaxedReferrals` function in `common/src/util/referral.ts` is used to check if a user has reached their referral limit. This function should be used consistently across the application to ensure uniform enforcement of the referral limit.

4. **Redemption Process**: When redeeming a referral code (in the POST request handler), always check if the referrer has maxed out their referrals before processing the redemption. This ensures that users cannot exceed their referral limit even if they distribute their referral code widely.

5. **Error Handling**: Provide clear error messages when a referral code cannot be redeemed due to the referrer reaching their limit. This helps maintain a good user experience.

Remember to keep the referral system logic consistent between the backend API and the websocket server to ensure uniform behavior across different parts of the application.

## Recent Updates

1. **Error Handling Improvements**:

   - Updated error messages in the `protec` middleware to include more helpful information and the support email address.
   - Changed the return type of some middleware functions from `Error` to `ServerAction` for more consistent error handling.

2. **Usage Information Refactoring**:

   - Renamed `sendUsageInfo` to `getUsageInfo` in `websocket-action.ts`.
   - Modified `getUsageInfo` to return a usage response object instead of directly sending an action.
   - Updated the `usage-response` action schema to include a `showUser` boolean field.

3. **Environment Configuration**:

   - Added `NEXT_PUBLIC_SUPPORT_EMAIL` to the environment variables in `env.mjs`.

4. **CLI Enhancements**:
   - Improved the formatting of the welcome message in the CLI.

These changes aim to provide a better user experience by offering more informative error messages, streamlining usage information handling, and improving the overall system consistency.

Remember to keep this knowledge file updated as the application evolves or new features are added.
```
