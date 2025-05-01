# Codebuff

Codebuff is a tool for editing codebases via natural language instruction to Buff, an expert AI programming assistant.

## File Change Management

Codebuff uses the generate diffs by expansion strategy for managing file changes. This approach has Haiku expand a file with placeholders into the full file, and then generates string patches instead of search and replace blocks.

Key points:

- The FileChanges type is an array of string patches.
- The mainPrompt function uses the generatePatch function from generate-diffs-via-expansion.ts to create patches.
- The client-side code applies patches using the applyPatch function from the 'diff' library.

This change improves the accuracy and reliability of file modifications, especially for complex changes or when dealing with large files.

## Project Goals

1. **Developer Productivity**: Reduce the time and effort required for common programming tasks, allowing developers to focus on higher-level problem-solving.

## Project Templates

Codebuff provides starter templates that can be used to initialize new projects:

```bash
codebuff --create <template> [project-name]
```

Templates are maintained in the [codebuff community repo](https://github.com/CodebuffAI/codebuff-community). Each directory in the starter-templates and showcase directories corresponds to a template that can be used with the --create flag.

Example template:

- nextjs: Next.js starter template

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
8. **Terminal Command Execution**: Allows Buffy to run shell commands in the user's terminal.

## Important Files

- `backend/src/claude.ts`: Interacts with the Claude AI model.
- `backend/src/server.ts`: Sets up the WebSocket server.
- `common/src/actions.ts`: Defines schemas for client and server actions.
- `src/project-files.ts`: Handles project file operations.
- `src/index.ts`: Contains main application logic and user input handling.
- `knowledge.md`: Stores project-wide knowledge and best practices.

## Referral System

The Codebuff project includes a referral system designed to encourage user growth and reward existing users for bringing in new members. Here's a high-level overview:

- Purpose: Increase user base and engagement by incentivizing current users to invite others.
- Functionality: Users can share a unique referral code or link with potential new users.
- Reward: Both the referrer and the new user receive bonus credits upon successful referral.
- Implementation: Spread across multiple files in the project, handling various aspects such as code generation, validation, and reward distribution.
- Limits: There's a cap on the number of referrals a user can make to prevent system abuse.

The referral system integrates with the user authentication flow and credit management system, providing a seamless experience for both new and existing users.

- `common/src/util/server/referral.ts`: Contains the `hasMaxedReferrals` function to check if a user has reached their referral limit.
- `web/src/app/api/referrals/route.ts`: Handles API routes for referral-related operations.
- `common/src/util/referral.ts`: Contains utility functions like `getReferralLink`.

## Development Guidelines

1. Use TypeScript for all new code to maintain type safety.

## Backward Compatibility

When replacing old patterns with new ones:
- Keep support for old patterns during transition (e.g. .manicodeignore → .codebuffignore)
- Use clear fallback chains (try current pattern first, fall back to legacy)
- For ignore files specifically: .codebuffignore is standard, .manicodeignore is legacy support
- Document both old and new patterns in user-facing content
- Plan to remove old pattern support in a future major version

## Backward Compatibility

When replacing old patterns with new ones:
- Keep support for old patterns during transition (e.g. .codebuffignore → .manicodeignore)
- Use clear fallback chains (try new pattern first, fall back to old)
- Document both old and new patterns in user-facing content
- Plan to remove old pattern support in a future major version
2. Follow existing code structure and naming conventions.
3. Ensure alternating user and Buffy messages in conversation history.
4. Update knowledge files for significant changes or new features.
5. Write clear, concise comments and documentation for complex logic.
6. Remember that imports automatically remove 'src' from the path. When editing files, always include 'src' in the file path if it's part of the actual directory structure.

## Knowledge Management

## Knowledge File Management

- Knowledge is stored in `knowledge.md` files, which can be created in relevant directories throughout the project.
- Buffy automatically updates knowledge files when learning new information or correcting mistakes.
- Developers are encouraged to review and commit knowledge file changes to share insights across the team.

When updating knowledge files:

1. Focus on high-level impacts and overall project direction, rather than specific implementation details.
2. Summarize changes in terms of their effect on the project's goals and user experience.
3. Avoid duplicating information that's already evident from the code itself.
4. Keep entries concise and relevant to the long-term understanding of the project.
5. When in doubt, prefer broader, more abstract descriptions over detailed, low-level explanations.

These guidelines help maintain useful and accessible knowledge files that provide valuable context without becoming overly verbose or quickly outdated.

## Terminal Command Execution

Buffy can execute terminal commands using the `run_terminal_command` tool. This feature allows Buffy to perform various tasks such as:

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

## TODO

- Implement authentication and authorization for WebSocket connections.
- Add more comprehensive error handling and logging.
- Implement rate limiting for AI requests to manage resource usage.
- Create a robust testing suite for all components.

# Code guide

- We don't specify return types for functions, since Typescript will infer them.
- Always include 'src' in file paths when it's part of the actual directory structure, even though imports automatically remove it.
- Keep transformations simple and pure:
  - One clear purpose per function
  - Handle edge cases with early returns
  - Use const assertions for better type inference
  - Prefer small, focused functions over complex abstractions

## Architecture Principles

- Use single sources of truth for core business logic:
  - Put calculation logic in dedicated functions (e.g., `getNextQuotaReset`)
  - Avoid treating database values as authoritative when they're derived
  - Pass derived values through the dedicated calculation functions
  - This ensures consistent behavior across the system
  - Example: Quota reset dates are calculated by `getNextQuotaReset`, not read directly from DB

## Constants and Configuration

Important constants and configuration values are centralized in `common/src/constants.ts`. This includes:

- `CREDITS_REFERRAL_BONUS`: The number of credits awarded for a successful referral.
- `CREDITS_USAGE_LIMITS`: Defines credit limits for different user types (ANON, FREE, PAID).

Centralizing these constants makes it easier to manage and update project-wide settings.

## Referral System

Codebuff implements a referral system to encourage user growth and reward existing users for bringing in new members. The referral system works as follows:

1. Each user receives a unique referral code.
2. Users can share their referral code with others.
3. When a new user signs up using a referral code, both the referrer and the new user receive bonus credits.
4. There's a limit to how many successful referrals a user can make.

The referral system is integrated across the web application and the CLI tool, providing a seamless experience for users to share and redeem referral codes.

## Development Guidelines

1. Use TypeScript for all new code to maintain type safety.
   The referral system is implemented across several files:

- Implement authentication and authorization for WebSocket connections.
- Add more comprehensive error handling and logging.
- Implement rate limiting for AI requests to manage resource usage.
- Create a robust testing suite for all components.

# Code guide

- We don't specify return types for functions, since Typescript will infer them. Don't write return types for functions!
- Always include 'src' in file paths when it's part of the actual directory structure, even though imports automatically remove it.
- Keep transformations simple and pure:
  - One clear purpose per function
  - Handle edge cases with early returns
  - Use const assertions for better type inference
  - Prefer small, focused functions over complex abstractions

## Python Package

A Python package for Codebuff has been created as a skeleton in python-app. Key points:

- It's currently a placeholder that prints a message about the package coming soon and suggests installing the npm version.

- The Python package is intended to be developed further in the future to provide similar functionality to the npm version.

## Version Checking

Upon start-up, the client checks the npmjs.org registry for the latest version of the npm package. If the version is newer, Codebuff will automatically try to download and install the latest version. Once it does, it'll prompt the user to restart the application.

# Verifying changes

Use judgment when verifying changes. For complex changes that could affect types or dependencies, run the type checker with `bun run --cwd backend typecheck` (or sub "backend" for the appropriate project) and then fix any type errors that resulted from your change. For simple changes like adding console.logs or text updates, type checking is unnecessary.

Only run type checking when:

1. Specifically requested by the user
2. Making non-trivial changes that could affect types
3. Changing code that is imported by other files

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
