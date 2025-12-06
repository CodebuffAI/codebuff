# Testing Guide

This document explains how testing is organized across the Codebuff monorepo. For detailed, package-specific instructions, see the README files in each package's `__tests__/` directory.

## Test Types by Project

| Project | Unit                            | Integration               | E2E                              |
| ------- | ------------------------------- | ------------------------- | -------------------------------- |
| **CLI** | Individual functions/components | CLI with mocked backend   | Full stack: CLI → SDK → Web → DB |
| **Web** | React components, API handlers  | API routes with mocked DB | Real browser via Playwright      |
| **SDK** | Client functions, parsing       | SDK calls to real API     | (covered by CLI E2E)             |

## What "E2E" Means Here

The term "end-to-end" means different things for different parts of the system:

### CLI E2E (Full-Stack Testing)

**CLI E2E tests are the most comprehensive** - they test the entire user journey:

```
User launches terminal
    → Types commands
    → CLI renders UI (via terminal emulator)
    → CLI calls SDK
    → SDK calls Web API
    → API queries Database (real Postgres in Docker)
    → Response flows back through the stack to the terminal
```

**Location:** `cli/src/__tests__/e2e/`

**Prerequisites:**

- Docker (for Postgres database)
- SDK built (`cd sdk && bun run build`)
- psql available (for database seeding)

### Web E2E (Browser Testing)

**Web E2E tests the browser experience** using Playwright:

```
Real browser loads page
    → Renders SSR content
    → Hydrates client-side
    → User interactions trigger API calls (mocked or real)
```

**Location:** `web/src/__tests__/e2e/`

**Prerequisites:**

- Playwright installed (`bunx playwright install`)
- Web server running (auto-started by Playwright)

### SDK Integration (API Testing)

**SDK integration tests verify API connectivity:**

```
SDK makes real HTTP calls to the backend
    → Verifies authentication, request/response formats
    → Tests prompt caching, error handling
```

**Location:** `sdk/src/__tests__/*.integration.test.ts`

**Prerequisites:**

- Valid `CODEBUFF_API_KEY` environment variable

## Running Tests

### Quick Start

```bash
# Run all tests in a package
cd cli && bun test
cd web && bun test
cd sdk && bun test

# Run specific test file
bun test path/to/test.ts

# Run with watch mode
bun test --watch
```

### CLI Tests

```bash
cd cli

# Unit tests (fast, no dependencies)
bun test cli-args.test.ts

# UI tests (requires SDK)
bun test cli-ui.test.ts

# E2E tests (requires Docker + SDK built)
bun test e2e/
```

### Web Tests

```bash
cd web

# Unit/integration tests
bun test

# E2E tests with Playwright
bunx playwright test

# E2E with UI mode (interactive debugging)
bunx playwright test --ui
```

### SDK Tests

```bash
cd sdk

# Unit tests
bun test

# Integration tests (requires API key)
CODEBUFF_API_KEY=your-key bun test run.integration.test.ts
```

## Test File Naming Conventions

| Pattern                 | Type                   | Example                               |
| ----------------------- | ---------------------- | ------------------------------------- |
| `*.test.ts`             | Unit tests             | `cli-args.test.ts`                    |
| `*.integration.test.ts` | Integration tests      | `run.integration.test.ts`             |
| `integration/*.test.ts` | Integration tests      | `integration/api-integration.test.ts` |
| `e2e/*.test.ts`         | E2E tests (Bun)        | `e2e/full-stack.test.ts`              |
| `*.spec.ts`             | E2E tests (Playwright) | `store-ssr.spec.ts`                   |

Files matching `*integration*.test.ts` or `*e2e*.test.ts` trigger automatic dependency checking (tmux, SDK build status) in the `.bin/bun` wrapper.

## Directory Structure

```
cli/src/__tests__/
├── e2e/               # Full stack: CLI → SDK → Web → DB
│   ├── README.md      # CLI E2E documentation
│   └── full-stack.test.ts
├── integration/       # Tests with mocked backend
├── helpers/           # Test utilities
├── mocks/             # Mock implementations
├── cli-ui.test.ts     # CLI UI tests (requires SDK)
├── *.test.ts          # Other unit tests
└── README.md          # CLI testing overview

web/src/__tests__/
├── e2e/               # Browser tests with Playwright
│   ├── README.md      # Web E2E documentation
│   └── *.spec.ts
└── ...

sdk/src/__tests__/
├── *.test.ts          # Unit tests
└── *.integration.test.ts  # Real API calls
```

## Writing Tests

### Best Practices

1. **Use dependency injection** over mocking modules
2. **Follow naming conventions** for automatic detection
3. **Clean up resources** in `afterEach`/`afterAll`
4. **Add graceful skipping** for missing dependencies
5. **Keep tests focused** - one behavior per test

### Example: CLI Unit Test

```typescript
import { describe, test, expect } from 'bun:test'

describe('parseArgs', () => {
  test('parses --agent flag', () => {
    const result = parseArgs(['--agent', 'base'])
    expect(result.agent).toBe('base')
  })
})
```

### Example: CLI Integration Test

```typescript
import { describe, test, expect, afterEach, mock } from 'bun:test'

describe('API Integration', () => {
  afterEach(() => {
    mock.restore()
  })

  test('handles 401 responses', async () => {
    // Mock fetch, test error handling
  })
})
```

### Example: CLI E2E Test

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { createE2ETestContext } from './test-cli-utils'

describe('E2E: Chat', () => {
  let ctx: E2ETestContext

  beforeAll(async () => {
    ctx = await createE2ETestContext('chat')
  }, 180000)

  afterAll(async () => {
    await ctx?.cleanup()
  })

  test('can type and send message', async () => {
    const session = await ctx.createSession()
    await session.cli.type('hello')
    await session.cli.press('enter')
    // Assert response
  })
})
```

## CI/CD

Tests run automatically in CI. Some tests are skipped when prerequisites aren't met:

- **E2E tests** skip if Docker unavailable or SDK not built
- **Integration tests** skip if tmux not installed
- **SDK integration tests** skip if no API key

## Troubleshooting

### Tests hanging?

- Check tmux session isn't waiting for input
- Ensure proper cleanup in `finally` blocks
- Use timeouts for async operations

### E2E tests failing?

- Verify Docker is running: `docker info`
- Rebuild SDK: `cd sdk && bun run build`
- Clean up orphaned containers: `docker ps -aq --filter "name=${E2E_CONTAINER_NAME:-manicode-e2e}-" | xargs docker rm -f`

### Playwright tests failing?

- Install browsers: `bunx playwright install`
- Check web server is accessible
- Run with `--debug` for step-by-step execution

## Package-Specific Documentation

- [CLI Testing](cli/src/__tests__/README.md)
- [CLI E2E Testing](cli/src/__tests__/e2e/README.md)
- [Web E2E Testing](web/src/__tests__/e2e/README.md)
- [Evals Framework](evals/README.md)
