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

## Agent System

- **LLM-based Agents**: Traditional agents defined in `backend/src/templates/` using prompts and LLM models
- **Programmatic Agents**: Custom agents using JavaScript/TypeScript generator functions in `.agents/templates/`
- **Dynamic Agent Templates**: User-defined agents in TypeScript files with `handleSteps` generator functions
- Agent templates define available tools, spawnable sub-agents, and execution behavior
- Programmatic agents allow complex orchestration logic, conditional flows, and iterative refinement
- Generator functions execute in secure QuickJS sandbox for safety
- Both types integrate seamlessly through the same tool execution system

## CLI Interface Features

- ESC key to toggle menu or stop AI response
- CTRL+C to exit the application

### Shell Shims (Direct Commands)

Codebuff supports shell shims for direct command invocation without the `codebuff` prefix.

- **Cross-platform**: Works on Windows (CMD/PowerShell), macOS, and Linux (bash/zsh/fish)
- **Store integration**: Uses fully qualified agent IDs from the agent store
- **Easy management**: Install, update, list, and uninstall shims via CLI commands### Quick Start (Recommended)

```bash
# One-step setup: install and add to PATH automatically
codebuff shims install codebuff/base-lite@1.0.0

# Use immediately in current session (follow the printed instruction)
eval "$(codebuff shims env)"

# Now use direct commands!
base-lite "fix this bug"             # Works right away!
```

## Package Management

- Use Bun for all package management operations
- Run commands with `bun` instead of `npm` (e.g., `bun install` not `npm install`)
- Use `bun run` for script execution

## TypeScript Build State Management

### Cleaning Build State

- Use `bun run clean-ts` to remove all TypeScript build artifacts (.tsbuildinfo files and .next cache)
- This resolves infinite loop issues in the typechecker caused by corrupted or stale build cache

### Common Issues

- Typechecker infinite loops are often caused by stale .tsbuildinfo files or circular project references
- Always clean build state when encountering persistent type errors or infinite loops
- The monorepo structure with project references can sometimes create dependency cycles

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

- Prefer specific imports over import \* to make dependencies explicit
- Exception: When mocking modules with many internal dependencies (like isomorphic-git), use import \* to avoid listing every internal function

### Bun Testing Best Practices

**Always use `spyOn()` instead of `mock.module()` for function and method mocking.**

- When mocking modules is required (for the purposes of overriding constants instead of functions), use the wrapper functions found in `@codebuff/common/testing/mock-modules.ts`.
  - `mockModule` is a drop-in replacement for `mock.module`, but the module should be the absolute module path (e.g., `@codebuff/common/db` instead of `../db`).
  - Make sure to call `clearMockedModules()` in `afterAll` to restore the original module implementations.

**Preferred approach:**

```typescript
// ✅ Good: Use spyOn for clear, explicit mocking
import { spyOn, beforeEach, afterEach } from 'bun:test'
import * as analytics from '../analytics'

beforeEach(() => {
  // Spy on module functions
  spyOn(analytics, 'trackEvent').mockImplementation(() => {})
  spyOn(analytics, 'initAnalytics').mockImplementation(() => {})

  // Spy on global functions like Date.now and setTimeout
  spyOn(Date, 'now').mockImplementation(() => 1234567890)
  spyOn(global, 'setTimeout').mockImplementation((callback, delay) => {
    // Custom timeout logic for tests
    return 123 as any
  })
})

afterEach(() => {
  // Restore all mocks
  mock.restore()
})
```

**Real examples from our codebase:**

```typescript
// From main-prompt.test.ts - Mocking LLM APIs
spyOn(aisdk, 'promptAiSdk').mockImplementation(() =>
  Promise.resolve('Test response'),
)
spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
  yield 'Test response'
})

// From rage-detector.test.ts - Mocking Date
spyOn(Date, 'now').mockImplementation(() => currentTime)

// From run-agent-step-tools.test.ts - Mocking imported modules
spyOn(websocketAction, 'requestFiles').mockImplementation(
  async (ws: any, paths: string[]) => {
    const results: Record<string, string | null> = {}
    paths.forEach((p) => {
      if (p === 'src/auth.ts') {
        results[p] = 'export function authenticate() { return true; }'
      } else {
        results[p] = null
      }
    })
    return results
  },
)
```

**Use `mock.module()` only for entire module replacement:**

```typescript
// ✅ Good: Use mock.module for replacing entire modules
mock.module('../util/logger', () => ({
  logger: {
    debug: () => {},
    error: () => {},
    info: () => {},
    warn: () => {},
  },
  withLoggerContext: async (context: any, fn: () => Promise<any>) => fn(),
}))

// ✅ Good: Mock entire module with multiple exports using anonymous function
mock.module('../services/api-client', () => ({
  fetchUserData: jest.fn().mockResolvedValue({ id: 1, name: 'Test User' }),
  updateUserProfile: jest.fn().mockResolvedValue({ success: true }),
  deleteUser: jest.fn().mockResolvedValue(true),
  ApiError: class MockApiError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message)
    }
  },
  API_ENDPOINTS: {
    USERS: '/api/users',
    PROFILES: '/api/profiles',
  },
}))
```

**Benefits of spyOn:**

- Easier to restore original functionality with `mock.restore()`
- Clearer test isolation
- Doesn't interfere with global state (mock.module carries over from test file to test file, which is super bad and unintuitive.)
- Simpler debugging when mocks fail

### Test Setup Patterns

**Extract duplicative mock state to `beforeEach` for cleaner tests:**

```typescript
// ✅ Good: Extract common mock objects to beforeEach
describe('My Tests', () => {
  let mockFileContext: ProjectFileContext
  let mockAgentTemplate: DynamicAgentTemplate

  beforeEach(() => {
    // Setup common mock data
    mockFileContext = {
      projectRoot: '/test',
      cwd: '/test',
      // ... other properties
    }

    mockAgentTemplate = {
      id: 'test-agent',
      version: '1.0.0',
      // ... other properties
    }
  })

  test('should work with mock data', () => {
    const agentTemplate = {
      'test-agent': {
        ...mockAgentTemplate,
        handleSteps: 'custom function',
      } as any, // Use type assertion when needed
    }

    const fileContext = {
      ...mockFileContext,
      agentTemplates: agentTemplate,
    }
    // ... test logic
  })
})
```

**Benefits:**

- Reduces code duplication across tests
- Makes tests more maintainable
- Ensures consistent mock data structure
- Easier to update mock data in one place

## Constants and Configuration

Important constants are centralized in `common/src/constants.ts`:

- `CREDITS_REFERRAL_BONUS`: Credits awarded for successful referral
- Credit limits for different user types

## Referral System

**IMPORTANT**: Referral codes must be applied through the npm-app CLI, not through the web interface.

- Web onboarding flow shows instructions for entering codes in CLI
- Users must type their referral code in the Codebuff terminal after login
- Auto-redemption during web login was removed to prevent abuse
- The `handleReferralCode` function in `npm-app/src/client.ts` handles CLI redemption
- The `redeemReferralCode` function in `web/src/app/api/referrals/helpers.ts` processes the actual credit granting

### OAuth Referral Code Preservation

**Problem**: NextAuth doesn't preserve referral codes through OAuth flow because:

- NextAuth generates its own state parameter for CSRF/PKCE protection
- Custom state parameters are ignored/overwritten
- OAuth callback URLs don't always survive the round trip

**Solution**: Multi-layer approach implemented in SignInButton and ReferralRedirect components:

1. **Primary**: Use absolute callback URLs with referral codes for better NextAuth preservation
2. **Fallback**: Store referral codes in localStorage before OAuth starts
3. **Recovery**: ReferralRedirect component on home page catches missed referrals and redirects to onboard page

## Environment Variables

This project uses [Infisical](https://infisical.com/) for secret management. All secrets are injected at runtime.

### Release Process

The release mechanism uses the `CODEBUFF_GITHUB_TOKEN` environment variable directly. The old complex GitHub App token generation system has been removed in favor of using a simple personal access token or the infisical-managed token.

**To run any service locally, use the `exec` runner script from root `package.json`**, which wraps commands with `infisical run --`.

Example: `bun run exec -- bun --cwd backend dev`

Environment variables are defined and validated in `packages/internal/src/env.ts`. This module provides type-safe `env` objects for use throughout the monorepo.

### Bun Wrapper Script

The `.bin/bun` script automatically wraps bun commands with infisical when secrets are needed. It prevents nested infisical calls by checking for `NEXT_PUBLIC_INFISICAL_UP` environment variable, ensuring infisical runs only once at the top level while nested bun commands inherit the environment variables.

**Worktree Support**: The wrapper automatically detects and loads `.env.worktree` files when present, allowing worktrees to override Infisical environment variables (like ports) for local development. This enables multiple worktrees to run simultaneously on different ports without conflicts.

The wrapper also loads environment variables in the correct precedence order:

1. Infisical secrets are loaded first (if needed)
2. `.env.worktree` is loaded second to override any conflicting variables
3. This ensures worktree-specific overrides (like custom ports) always take precedence over cached Infisical defaults

The wrapper looks for `.env.worktree` in the project root directory, making it work consistently regardless of the current working directory when bun commands are executed.

**Performance Optimizations**: The wrapper uses `--silent` flag with Infisical to reduce CLI output overhead and sets `INFISICAL_DISABLE_UPDATE_CHECK=true` to skip version checks for faster startup times.

**Infisical Caching**: The wrapper implements robust caching of environment variables in `.infisical-cache` with a 15-minute TTL (configurable via `INFISICAL_CACHE_TTL`). This reduces startup time from ~1.2s to ~0.16s (87% improvement). The cache uses `infisical export` which outputs secrets directly in `KEY='value'` format, ensuring ONLY Infisical-managed secrets are cached (no system environment variables). Multi-line secrets like RSA private keys are handled correctly using `source` command. Cache automatically invalidates when `.infisical.json` is modified or after TTL expires. Uses subshell execution to avoid changing the main shell's working directory.

**Session Validation**: The wrapper detects expired Infisical sessions using `infisical export` with a robust 10-second timeout implementation that works cross-platform (macOS and Linux). Uses background processes with polling to prevent hanging on interactive prompts. Valid sessions output environment variables in `KEY='value'` format, while expired sessions either output interactive prompts or timeout. Provides clear error messages directing users to run `infisical login`.

## Python Package

A Python package skeleton exists in python-app. Currently a placeholder that suggests installing the npm version.

## Project Templates

Codebuff provides starter templates for initializing new projects:

```bash
codebuff --create <template> [project-name]
```

Templates are maintained in the codebuff community repo. Each directory corresponds to a template usable with the --create flag.

## Database Schema and Migrations

**Important**: When adding database indexes or schema changes, modify the schema file directly (`common/src/db/schema.ts`) using Drizzle's index syntax, then run the migration generation script to create the actual migration files.

**Do NOT** write migration SQL files directly. The proper workflow is:

1. Update `common/src/db/schema.ts` with new indexes using Drizzle syntax
2. Run the migration generation script to create the SQL migration files
3. Apply the migrations using the deployment process

Example of adding performance indexes:

```typescript
index('idx_table_optimized')
  .on(table.column1, table.column2)
  .where(sql`${table.status} = 'completed'`)
```
