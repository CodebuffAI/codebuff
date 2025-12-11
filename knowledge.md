# Codebuff

Codebuff is a tool for editing codebases via natural language instruction to Buffy, an expert AI programming assistant.

## Project Goals

1. **Developer Productivity**: Reduce time and effort for common programming tasks
2. **Learning and Adaptation**: Develop a system that learns from user interactions
3. **Focus on power users**: Make expert software engineers move even faster

## Key Technologies

- **TypeScript**: Primary programming language
- **Bun**: Package manager and runtime
- **LLMs**: Multiple providers (Anthropic, OpenAI, Gemini, etc.) for various coding tasks

## Main Components

1. **LLM Integration**: Processes natural language instructions and generates code changes
2. **File Management**: Reads, parses, and modifies project files
3. **Action Handling**: Processes various client and server actions
4. **Knowledge Management**: Handles creation, updating, and organization of knowledge files
5. **Terminal Command Execution**: Allows running shell commands in user's terminal

## API Flow

1. The SDK/CLI sends user input and file context to the Codebuff web API.
2. The agent runtime processes the request and streams response chunks back through the SDK callbacks.
3. Tools run locally via the SDK's helpers (file edits, terminal commands, search) to satisfy model tool calls.

## Tool Handling System

- Tools are defined in `common/src/tools` and executed via the SDK tool helpers and agent runtime
- Available tools: read_files, write_file, str_replace, run_terminal_command, code_search, browser_logs, spawn_agents, web_search, read_docs, run_file_change_hooks, and others
- Tool calls request additional information or perform actions based on the current project state

## Agent System

- **LLM-based Agents**: Traditional agents defined in `.agents/` subdirectories using prompts and LLM models
- **Programmatic Agents**: Custom agents using JavaScript/TypeScript generator functions in `.agents/`
- **Dynamic Agent Templates**: User-defined agents in TypeScript files with `handleSteps` generator functions
- Agent templates define available tools, spawnable sub-agents, and execution behavior
- Programmatic agents allow complex orchestration logic, conditional flows, and iterative refinement
- Generator functions execute in secure QuickJS sandbox for safety
- Both types integrate seamlessly through the same tool execution system

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

## Development Workflow

### Starting the Development Environment

```bash
# Full development environment (services + CLI)
bun dev                    # Starts db, studio, sdk, web, then CLI
                           # Ctrl+C stops everything

# Or run services and CLI separately
bun start-services         # Start services in background, exits when ready
bun start-cli              # Start CLI in foreground
bun stop-services          # Stop background services
```

**Services started:**
- `db` - PostgreSQL database (via Docker)
- `studio` - Drizzle Studio for database inspection
- `sdk` - SDK build (one-time)
- `web` - Next.js web server

**Logs:** All service logs are written to `debug/console/`:
- `db.log`, `studio.log`, `sdk.log`, `web.log`

**Worktree Support:** Each worktree can run on different ports. Create `.env.development.local` with:
```
PORT=3001
NEXT_PUBLIC_WEB_PORT=3001
NEXT_PUBLIC_CODEBUFF_APP_URL=http://localhost:3001
```

The `stop-services` command is worktree-safe - it only kills services on the port configured for that worktree.

## Package Management

- Use Bun for all package management operations
- Run commands with `bun` instead of `npm` (e.g., `bun install` not `npm install`)
- Use `bun run` for script execution

## Git Workflow Best Practices

### Never Force Push to Main

**Never use `git push --force` or `git push --force-with-lease` on the main branch unless the user explicitly and clearly asks for it.** This can overwrite other developers' work and cause CI/deployment issues.

- A simple "push" request is NOT permission to force push - only a regular push should be attempted
- If a push is rejected due to diverged history, **stop and ask the user** what they want to do
- Do NOT automatically escalate to force push when a regular push fails
- Only force push if the user explicitly says something like "force push to main" or "yes, force push"
- If you need to amend a commit that's already on main, create a new commit instead
- Force pushing is only acceptable on feature branches where you're the only contributor
- If a push is rejected, use `git pull --rebase` to integrate remote changes first

### Preserving Uncommitted Changes

**NEVER use `git checkout HEAD --` or `git restore` on files to exclude them from a commit.** This destructively discards uncommitted work.

When the user says "don't commit file X" or "exclude file X from the commit":
- ✅ Only `git add` the specific files they DO want committed
- ✅ Leave other files in their current state (staged or unstaged)
- ❌ NEVER run `git checkout HEAD -- <file>` or `git restore <file>` - this permanently deletes uncommitted changes

Correct approach for amending a commit with specific files:
```bash
# Only add the files to include
git add path/to/file-to-include.ts
git commit --amend --no-edit
```

### Interactive Git Commands

**Always use tmux when running interactive git commands** (e.g., `git rebase --continue`, `git add -p`, `git commit --amend`).

- Codebuff agents cannot interact with prompts that require user input
- Interactive git commands will hang if run directly through the commander agent
- Use tmux to provide an interactive session where the user can handle git prompts manually
- For automated operations, prefer non-interactive git commands when possible (e.g., `git rebase --continue` after resolving conflicts programmatically)

**Common Interactive Git Commands (require tmux):**

- `git rebase --continue` - Continue rebase after resolving conflicts
- `git rebase --skip` - Skip current commit during rebase
- `git rebase --abort` - Abort rebase operation
- `git rebase -i` / `git rebase --interactive` - Interactive rebase with editor
- `git add -p` / `git add --patch` - Interactively stage hunks
- `git add -i` / `git add --interactive` - Interactive staging
- `git commit --amend` - Amend last commit (opens editor)
- `git commit -v` / `git commit --verbose` - Commit with diff in editor
- `git merge --continue` - Continue merge after resolving conflicts
- `git merge --abort` - Abort merge operation
- `git cherry-pick --continue` - Continue cherry-pick after conflicts
- `git cherry-pick --abort` - Abort cherry-pick operation
- `git stash save -p` - Interactively stash changes
- `git checkout -p` - Interactively discard changes
- `git reset -p` - Interactively unstage changes
- `git clean -i` - Interactively clean untracked files
- Any git command that opens an editor (commit messages, rebase todo list, etc.)

**Example:**

```bash
# ❌ Bad: Will hang waiting for input
git rebase --continue

# ✅ Good: Run in tmux for manual interaction
tmux new-session -d -s git-rebase
tmux send-keys -t git-rebase 'git rebase --continue' C-m
tmux attach -t git-rebase
```

## TypeScript Build State Management

### Cleaning Build State

- Use `bun run clean-ts` to remove all TypeScript build artifacts (.tsbuildinfo files and .next cache)
- This resolves infinite loop issues in the typechecker caused by corrupted or stale build cache

### Common Issues

- Typechecker infinite loops are often caused by stale .tsbuildinfo files or circular project references
- Always clean build state when encountering persistent type errors or infinite loops
- The monorepo structure with project references can sometimes create dependency cycles

## Error Handling Philosophy

**Prefer `ErrorOr<T>` return types over throwing errors.**

- Return type `ErrorOr<T>` for operations that fail
- Return `success(value)` or `failure(error)` from `common/src/util/error.ts`
  - e.g. `return failure(new Error('File not found'))`
- Allows callers to handle errors explicitly without try-catch
- Makes error cases visible in function signatures

## Error Handling and Debugging

- Error messages are logged to console and debug log files

## Security Considerations

- Project uses environment variables for sensitive information (API keys)
- User input is validated and sanitized before processing
- File operations are restricted to project directory

## API Endpoint Architecture

### Dependency Injection Pattern

All API endpoints in `web/src/app/api/v1/` follow a consistent dependency injection pattern for improved testability and maintainability.

**Structure:**

1. **Implementation file** (`web/src/api/v1/<endpoint>.ts`) - Contains business logic with injected dependencies
2. **Route handler** (`web/src/app/api/v1/<endpoint>/route.ts`) - Minimal wrapper that injects dependencies
3. **Contract types** (`common/src/types/contracts/<domain>.ts`) - Type definitions for injected functions
4. **Unit tests** (`web/src/api/v1/__tests__/<endpoint>.test.ts`) - Comprehensive tests with mocked dependencies

**Example:**

```typescript
// Implementation file - Contains business logic
export async function myEndpoint(params: {
  req: NextRequest
  getDependency: GetDependencyFn
  logger: Logger
  anotherDep: AnotherDepFn
}) {
  // Business logic here
}

// Route handler - Minimal wrapper
export async function GET(req: NextRequest) {
  return myEndpointGet({ req, getDependency, logger, anotherDep })
}

// Contract type (in common/src/types/contracts/)
export type GetDependencyFn = (params: SomeParams) => Promise<SomeResult>
```

**Benefits:**

- Easy to mock dependencies in unit tests
- Type-safe function contracts shared across the codebase
- Clear separation between routing and business logic
- Consistent pattern across all endpoints

**Contract Types Location:**
All contract types live in `common/src/types/contracts/`.

**Contract Type Pattern:**
For generic function types, use separate Input/Output types:

```typescript
// Define input type
export type MyFunctionInput<T> = {
  param1: string
  param2: T
}

// Define output type
export type MyFunctionOutput<T> = Promise<SomeResult<T>>

// Define function type using Input/Output
export type MyFunctionFn = <T>(
  params: MyFunctionInput<T>,
) => MyFunctionOutput<T>
```

## Testing Guidelines

### Dependency Injection (Primary Approach)

**Prefer dependency injection over mocking.** Design functions to accept dependencies as parameters with contract types defined in `common/src/types/contracts/`.

```typescript
// ✅ Good: Dependency injection with contract types
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export async function myFunction(params: {
  trackEvent: TrackEventFn
  logger: Logger
  getData: GetDataFn
}) {
  const { trackEvent, logger, getData } = params
  // Use injected dependencies
}

// Test with simple mock implementations
const mockTrackEvent: TrackEventFn = mock(() => {})
const mockLogger: Logger = {
  error: mock(() => {}),
  // ... other methods
}
```

**Benefits:**

- No need for `spyOn()` or `mock.module()`
- Clear, type-safe dependencies
- Easy to test with simple mock objects
- Better code architecture and maintainability

### When to Use spyOn (Secondary Approach)

Use `spyOn()` only when dependency injection is impractical:

- Mocking global functions (Date.now, setTimeout)
- Testing legacy code without DI
- Overriding internal module behavior temporarily

```typescript
// Use spyOn for globals
spyOn(Date, 'now').mockImplementation(() => 1234567890)
```

### Avoid mock.module()

**Never use `mock.module()` for functions.** It pollutes global state and carries over between test files.

Only use for overriding module constants when absolutely necessary:

- Use wrapper functions in `@codebuff/common/testing/mock-modules.ts`
  - Use `await mockModule(...)` as a drop-in replacement for `mock.module`
  - Call `clearMockedModules()` in `afterAll` (or `afterEach`)

### Test Setup Patterns

Extract duplicative mock state to `beforeEach`:

```typescript
describe('My Tests', () => {
  let mockLogger: Logger
  let mockTrackEvent: TrackEventFn

  beforeEach(() => {
    mockLogger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }
    mockTrackEvent = mock(() => {})
  })

  afterEach(() => {
    mock.restore()
  })

  test('works with injected dependencies', async () => {
    await myFunction({ logger: mockLogger, trackEvent: mockTrackEvent })
    expect(mockTrackEvent).toHaveBeenCalled()
  })
})
```

## Constants and Configuration

Important constants are centralized in `common/src/constants.ts`:

- `CREDITS_REFERRAL_BONUS`: Credits awarded for successful referral
- Credit limits for different user types

## Referral System

**IMPORTANT**: Referral codes must be applied through the CLI, not through the web interface.

- Web onboarding flow shows instructions for entering codes in CLI
- Users must type their referral code in the Codebuff terminal after login
- Auto-redemption during web login was removed to prevent abuse
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

This project uses standard `.env.*` files for environment configuration. Bun natively loads these files automatically.

### File Hierarchy

Bun loads `.env` files in this order (highest precedence last):

1. `.env.local` - Main secrets file synced from Infisical (gitignored)
2. `.env.development.local` - Worktree-specific overrides like ports (gitignored, highest precedence)

**Note**: Bun also supports `.env` and `.env.development`, but this project only uses `.env.local` and `.env.development.local`.

### Infisical Integration

Infisical is used as a background sync mechanism to populate `.env.local`:

- The `.bin/bun` wrapper syncs secrets from Infisical to `.env.local`
- Caching: 15-minute TTL (configurable via `INFISICAL_CACHE_TTL`)
- Cache invalidates when `.infisical.json` is modified or TTL expires
- If Infisical is not set up, existing `.env.local` is used directly

**Setup Options**:
1. **With Infisical**: Run `infisical login`, secrets auto-sync to `.env.local`
2. **Without Infisical**: Copy `.env.example` to `.env.local` and fill in values

### Worktree Support

For git worktrees running on different ports:

- Create `.env.development.local` in the worktree with port overrides
- Bun loads `.env.development.local` with highest precedence, so it overrides ports from `.env.local`
- The `scripts/init-worktree.ts` script creates this file automatically

#### Worktree App URL Configuration

The `init-worktree.ts` script sets `NEXT_PUBLIC_CODEBUFF_APP_URL=http://localhost:${webPort}` in the root `.env.development.local`. This means:

- **CLI**: Will hit the local web server instead of production
- **SDK**: Will also use the local web server for API calls
- **SDK E2E Tests**: Require the local web server to be running

**Running SDK E2E tests in a worktree:**

```bash
# First, start the web server in one terminal
bun run --cwd web dev

# Then run SDK E2E tests in another terminal
bun test sdk/e2e
```

If you need to run SDK tests against production instead, override the environment variable:

```bash
NEXT_PUBLIC_CODEBUFF_APP_URL=https://codebuff.com bun test sdk/e2e
```

### Bun Wrapper Script (`.bin/bun`)

The wrapper's role is simple: ensure `.env.local` is synced from Infisical before running bun.

- Checks `NEXT_PUBLIC_INFISICAL_UP` to prevent nested syncs
- Uses `INFISICAL_DISABLE_UPDATE_CHECK=true` for faster startup
- 10-second timeout on Infisical commands to prevent hangs
- Falls back gracefully if Infisical is not available

### Release Process

The release mechanism uses the `CODEBUFF_GITHUB_TOKEN` environment variable directly.

Environment variables are defined and validated in `packages/internal/src/env.ts`. This module provides type-safe `env` objects for use throughout the monorepo.

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

## CLI Testing with OpenTUI and React 19

The CLI uses **OpenTUI** for terminal rendering, which requires **React 19**. This creates specific testing challenges.

### Known Testing Issues

**React Testing Library + React 19 + Bun Incompatibility**

- **Issue**: `renderHook()` from React Testing Library returns `result.current = null` when testing hooks
- **Affected**: All hook unit tests in `cli/src/__tests__/hooks/`
- **Root Cause**: React 19 is very new (Dec 2024) and has compatibility issues with:
  - React Testing Library's renderHook implementation
  - Bun's test runner environment
  - Both happy-dom and jsdom DOM implementations
- **Cannot Downgrade**: React 19 is required by OpenTUI for terminal rendering

### Testing Strategy

**For React Hooks in CLI:**

Use **integration tests** instead of isolated hook unit tests:

```typescript
// ❌ Doesn't work: Hook unit test with renderHook()
test('hook behavior', () => {
  const { result } = renderHook(() => useMyHook())
  // result.current is null - test fails
})

// ✅ Works: Integration test with actual component
test('hook behavior in component', () => {
  const TestComponent = () => {
    const hookResult = useMyHook()
    return <div>{/* use hookResult */}</div>
  }
  const { getByText } = render(<TestComponent />)
  // Test the component behavior
})
```

**For Non-Hook Code:**

- Direct function tests work fine
- Dependency injection pattern makes testing easy
- See: `cli/src/__tests__/hooks/use-auth-query.test.ts` for examples

**Dependency Injection Pattern:**

All CLI hooks follow DI pattern for easier testing:

```typescript
// Hook with optional dependencies
export function useMyHook(deps: {
  myDep?: MyDepFn
} = {}) {
  const { myDep = defaultMyDep } = deps
  // Use myDep
}

// Test with mocked dependencies
const mockDep = mock(() => {})
const component = <TestComponent deps={{ myDep: mockDep }} />
```

### Test Coverage Notes

- **Passing**: Function/utility tests (validateApiKey, SDK integration)
- **Blocked**: Hook-specific tests pending React 19 ecosystem updates
- **Workaround**: Integration tests via components provide coverage
