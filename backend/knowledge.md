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

## Development Guidelines

1. **Type Safety**: Utilize TypeScript's type system to ensure code reliability and catch errors early.
2. **Error Handling**: Implement proper error handling and logging throughout the application.
3. **Code Organization**: Keep related functionality grouped in appropriate modules and files.
4. **Documentation**: Maintain clear and up-to-date documentation, including this knowledge file.
5. **Testing**: Implement unit tests for critical components and functions.
6. **Environment Variables**: Use environment variables for configuration and sensitive information.
7. **Code Style**: Follow consistent coding style and use tools like Prettier for formatting.

## Web Scraping

The backend now includes a web scraping tool that allows the AI assistant to retrieve content from external web pages. This functionality is useful for gathering information from documentation, APIs, or other web-based resources.

- **Tool Name**: `scrape_web_page`
- **Input**: A URL of the web page to scrape
- **Output**: The content of the scraped web page

## Tool Handling

The backend implements a tool handling system that allows the AI assistant to perform various actions:

1. **Tool Definition**: Tools are defined in `tools.ts`, specifying their name, description, and input schema.
2. **Available Tools**: Current tools include read_files, scrape_web_page, search_manifold_markets, and run_terminal_command.
3. **Tool Execution**: When the AI makes a tool call, the backend processes it and provides the results back to the AI.

## Error Handling and Debugging

1. **Logging**: The `debug.ts` file provides logging functionality for debugging purposes.
2. **Error Catching**: WebSocket errors are caught and logged in both server and client code.
3. **Graceful Degradation**: The system attempts to handle errors gracefully, providing meaningful error messages when possible.

## Logging

- The project uses the pino logging library for structured logging.
- In production, use structured JSON logs for better parsing and analysis.
- In development, use pretty-printed logs for improved readability.
- Configure logging levels using the `LOG_LEVEL` environment variable.
- Example configuration:

```typescript
import pino from 'pino'
import { env } from '../env.mjs'

export const logger = pino({
  level: env.LOG_LEVEL || 'info',
  transport: env.NODE_ENV === 'production'
    ? undefined // Use default JSON logger in production
    : {
        target: 'pino-pretty',
        options: {
          colorize: true
        }
      }
})
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

## Debugging Docker Issues

- When encountering "Cannot find module" errors in a Docker container, it's important to verify the contents of the container itself, not just the local build.
- SSH access to the machine running the Docker container provides valuable debugging capabilities.
- The `dist` directory being correct locally doesn't guarantee it's correct inside the container.
- If a container is continuously restarting, it often indicates that the application is crashing immediately after starting. This prevents executing commands inside the container directly.
- The absence of the `dist` directory in the Docker container can cause "Cannot find module" errors, even if the directory exists locally.

## Git and Docker Best Practices

- The `dist` directory should be ignored by Git to avoid checking in build files.
- However, the `dist` directory needs to be included in the Docker image for the application to run correctly.
- The build process should occur before creating the Docker image to ensure the latest compiled files are included.

## Prompts

The backend uses several prompts to guide the AI assistant's behavior:

1. **System Prompt**: Initializes the AI assistant with project-specific context and instructions.
2. **Request Files Prompt**: Determines which files are relevant to a user's request.
3. **Main Prompt**: Processes the user's input and generates responses, including code changes.

### Request Files Prompt

- Located in `src/request-files-prompt.ts`
- Purpose: Identify all potentially relevant files for a user's request
- Key features:
  - Uses chain-of-thought reasoning to consider all possible relevant files
  - Aims to be comprehensive, requesting up to 100 files or more if necessary
  - Considers indirect dependencies and files that provide context
  - Outputs a thought process and a list of file paths

The Request Files Prompt is executed before the Main Prompt to ensure that all necessary files are loaded into the system context before processing the user's request.

## File Diff Generation

The backend uses two main strategies for generating file diffs:

1. **Diff Blocks Generation**: Implemented in `generate-diffs-prompt.ts`.
2. **Diff via Expansion**: Implemented in `generate-diffs-via-expansion.ts`.

### Using Bun for Testing

This project uses Bun for testing instead of Jest. When writing tests, keep the following in mind:

- Use `import { mock } from 'bun:test'` instead of Jest's mocking functions.
- Bun's test API is similar to Jest's, but there are some differences in implementation.
- When mocking methods, use `mock(object.method)` instead of Jest's `jest.spyOn(object, 'method')`.
- Bun's `mock` function expects 0-1 arguments, not 2 like Jest's `spyOn`.

## Plan Generation for Complex Requests

The backend now includes a feature to generate plans for complex user requests. This feature is designed to break down complex tasks into manageable steps and include appropriate verification processes.

Key components:
1. `check-plan-required.ts`: Determines if a plan is needed based on the complexity of the user's request.
2. `generate-plan.ts`: Creates a detailed plan with numbered steps and verification processes.
3. `main-prompt.ts`: Integrates plan generation into the main request handling flow.

The plan generation process:
1. `main-prompt.ts` calls `checkIfPlanRequired()` to determine if a plan is needed.
2. If a plan is required, `generatePlan()` is called to create a detailed plan.
3. The generated plan is streamed to the client using the `onResponseChunk` function, providing real-time updates.
4. The plan includes numbered steps, sub-steps, and appropriate verification steps (e.g., running type checkers, creating and running unit tests).

Important implementation details:
- The system prompt for plan generation is recreated to ensure it has the most up-to-date context.
- The warm cache call is only fired if no plan was required, optimizing performance by avoiding unnecessary caching when a plan is generated.

This feature enhances the system's ability to handle complex requests systematically and with proper verification. When working on request handling or AI prompts, consider whether the request might benefit from this plan generation feature.

