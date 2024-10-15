# Manicode Backend

This document provides an overview of the Manicode backend architecture, key components, and important concepts.

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
12. [Automatic URL Detection and Scraping](#automatic-url-detection-and-scraping)

## Architecture Overview

The Manicode backend is built on Node.js using TypeScript. It uses an Express server for HTTP requests and a WebSocket server for real-time communication with clients. The backend integrates with the Claude AI model to process user inputs and generate code changes.

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

4. **Main Prompt Handler (main-prompt.ts)**: Processes user inputs, generates responses, and manages file changes and tool calls.

5. **System Prompt Generator (system-prompt.ts)**: Creates the initial prompt for the AI assistant with project-specific context and instructions.

6. **File Diff Generation (generate-diffs-prompt.ts, generate-diffs-via-expansion.ts)**: Generates diffs for file changes and handles expansion of shortened file content.

7. **Relevant File Request (request-files-prompt.ts)**: Determines which files are relevant for a given user request.

8. **Tools Definition (tools.ts)**: Defines the available tools that can be used by the AI assistant.

## WebSocket Communication

The backend uses WebSockets for real-time, bidirectional communication with clients. Key concepts include:

- **Message Types**: Various message types (e.g., 'identify', 'subscribe', 'action') for different operations.
- **Action Handling**: The `websocket-action.ts` file processes incoming action messages and triggers appropriate responses.
- **Subscription Management**: Clients can subscribe to specific topics for targeted updates.

## Claude Integration

The backend integrates with the Claude AI model to process user inputs and generate code changes. Important aspects include:

- **Streaming Responses**: Responses from Claude are streamed in real-time to the client.
- **Tool Calls**: The AI can make tool calls (e.g., reading files) during its processing.
- **File Change Management**: The backend processes AI-suggested file changes and applies them to the project.

## File Management

The backend handles file operations for the Manicode project:

- **Reading Files**: The `read_files` tool allows the AI to access project file contents.
- **Applying Changes**: The `applyChanges` function in `prompts.ts` processes and applies file modifications suggested by the AI.

## Web Scraping

The backend now includes a web scraping tool that allows the AI assistant to retrieve content from external web pages. This functionality is useful for gathering information from documentation, APIs, or other web-based resources.

- **Tool Name**: `scrape_web_page`
- **Input**: A URL of the web page to scrape
- **Output**: The content of the scraped web page

## Error Handling and Quota Management

### Quota Exceeded Errors

When a user exceeds their quota, the error message returned now includes the current usage information. This helps users understand their current status without requiring an additional API call.

Implementation details:
- The `protec` middleware in `websockets/middleware.ts` handles quota checks.
- For both authenticated and anonymous users, when quota is exceeded:
  1. Retrieve current usage: `const { usage, limit } = await quotaManager.checkQuota(id)`
  2. Include usage in error message: `return getUsageInfo(true, fingerprintId, userId)`

This approach ensures that clients receive immediate feedback about their quota status, improving user experience and reducing unnecessary API calls.

## Tool Handling

The backend implements a tool handling system that allows the AI assistant to perform various actions:

1. **Tool Definition**: Tools are defined in `tools.ts`, specifying their name, description, and input schema.
2. **Available Tools**: Current tools include read_files, scrape_web_page, search_manifold_markets, and run_terminal_command.
3. **Tool Execution**: When the AI makes a tool call, the backend processes it and provides the results back to the AI.

## Error Handling and Debugging

1. **Logging**: The `debug.ts` file provides logging functionality for debugging purposes.
2. **Error Catching**: WebSocket errors are caught and logged in both server and client code.
3. **Graceful Degradation**: The system attempts to handle errors gracefully, providing meaningful error messages when possible.

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

