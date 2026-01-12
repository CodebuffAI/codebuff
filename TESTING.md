# Testing Guide

This document describes the testing patterns and utilities used in the Codebuff codebase, with a focus on **dependency injection (DI)** patterns that enable clean, isolated unit tests without module mocking.

## Table of Contents

- [Philosophy](#philosophy)
- [Test Fixtures](#test-fixtures)
- [Dependency Injection Patterns](#dependency-injection-patterns)
- [Mock Database Helpers](#mock-database-helpers)
- [Common Testing Scenarios](#common-testing-scenarios)
- [Migration from mockModule](#migration-from-mockmodule)

## Philosophy

We prefer **dependency injection over module mocking** for the following reasons:

1. **Type safety**: DI preserves TypeScript types and catches errors at compile time
2. **No cache pollution**: Module mocks can leak between tests; DI is isolated by design
3. **Explicit dependencies**: Functions declare what they need, making code easier to understand
4. **Faster tests**: No async module loading/unloading overhead

### When to Use Each Pattern

| Pattern | Use When |
|---------|----------|
| **DI with optional `deps` parameter** | Testing functions with external dependencies (DB, APIs, utilities) |
| **`spyOn()`** | Mocking methods on imported modules/objects (e.g., `spyOn(bigquery, 'insertTrace')`) |
| **Test fixtures** | Providing consistent test data across test files |
| **`mockModule()`** | Last resort for constants-only modules (avoid for functions) |

## Test Fixtures

Test fixtures live in `common/src/testing/fixtures/` and provide consistent test data.

### Importing Fixtures

```typescript
// Recommended: import from the barrel export
import { 
  testLogger,
  createTestAgentRuntimeParams,
  createMockUser,
  createMockCreditGrant,
} from '@codebuff/common/testing/fixtures'

// Or import specific fixture files
import { createMockDb } from '@codebuff/common/testing/mock-db'
```

### Available Fixtures

#### Agent Runtime Fixtures (`fixtures/agent-runtime.ts`)

```typescript
import {
  TEST_AGENT_RUNTIME_IMPL,      // Frozen object with all runtime deps
  testLogger,                    // Silent logger for tests
  testFileContext,               // Mock file context
  testAgentTemplate,             // Mock agent template
  createTestAgentRuntimeParams,  // Factory for complete test params
} from '@codebuff/common/testing/fixtures'

// Create test params with overrides
const params = createTestAgentRuntimeParams({
  userId: 'custom-user-id',
  promptAiSdkStream: async function* () {
    yield { type: 'text', text: 'mocked response' }
  },
})
```

#### Billing Fixtures (`fixtures/billing.ts`)

```typescript
import {
  TEST_BILLING_USER_ID,          // Billing-specific test user ID
  testLogger,                    // Silent logger
  createMockUser,                // Factory for mock users
  createMockCreditGrant,         // Factory for credit grants
  createTypicalUserGrants,       // Pre-configured grant set
  createMockBalance,             // Factory for balance results
  createTypicalUserDbConfig,     // Complete DB config for typical user
  createCapturingLogger,         // Logger that records calls for assertions
} from '@codebuff/common/testing/fixtures'
```

## Dependency Injection Patterns

### Pattern 1: Optional `deps` Parameter

Add an optional `deps` parameter to functions that defaults to real implementations:

```typescript
// In the source file
import { withTimeout as defaultWithTimeout } from '@codebuff/common/util/promise'

export async function searchWeb(options: {
  query: string
  logger: Logger
  fetch: typeof globalThis.fetch
  // Optional DI for testing
  withTimeout?: typeof defaultWithTimeout
}): Promise<string | null> {
  const { 
    query, 
    logger, 
    fetch, 
    withTimeout = defaultWithTimeout  // Default to real implementation
  } = options
  
  // Use injected or real withTimeout
  const response = await withTimeout(fetch(url), 30_000)
  // ...
}
```

```typescript
// In tests
import { searchWeb } from '../linkup-api'

// Mock that bypasses timeout
const mockWithTimeout = async <T>(promise: Promise<T>) => promise

test('handles API response', async () => {
  const result = await searchWeb({
    query: 'test',
    logger: testLogger,
    fetch: mockFetch,
    withTimeout: mockWithTimeout,  // Inject mock
  })
  expect(result).toBe('expected')
})
```

### Pattern 2: Deps Object for Multiple Dependencies

For functions with multiple injectable dependencies:

```typescript
// Define deps type
export interface CodeSearchDeps {
  spawn?: typeof import('child_process').spawn
}

// Add to function signature
export function codeSearch({
  projectPath,
  pattern,
  deps = {},
}: {
  projectPath: string
  pattern: string
  deps?: CodeSearchDeps
}) {
  const spawn = deps.spawn ?? defaultSpawn
  // ...
}
```

```typescript
// In tests
const mockSpawn = mock(() => mockChildProcess)

const result = await codeSearch({
  projectPath: '/test',
  pattern: 'search',
  deps: { spawn: mockSpawn },
})
```

### Pattern 3: Database Connection Injection

For billing and database-dependent functions:

```typescript
// Types in common/src/types/contracts/billing.ts
export type BillingDbConnection = {
  select: (...args: any[]) => any
  update: (...args: any[]) => any
  insert: (...args: any[]) => any
  query: { user: { findFirst: (params: any) => Promise<any> } }
}

export type TriggerMonthlyResetAndGrantDeps = {
  db?: BillingDbConnection
  transaction?: BillingTransactionFn
}
```

```typescript
// In the source file
export async function triggerMonthlyResetAndGrant({
  userId,
  logger,
  deps = {},
}: {
  userId: string
  logger: Logger
  deps?: TriggerMonthlyResetAndGrantDeps
}) {
  const transaction = deps.transaction ?? db.transaction.bind(db)
  
  return transaction(async (tx) => {
    // Use tx for all database operations
  })
}
```

### Pattern 4: Pure Function Extraction for Environment Testing

For testing environment-dependent behavior without mocking:

```typescript
// Extract pure function that takes environment as parameter
export const getConfigDirFromEnvironment = (
  environment: string | undefined,
): string => {
  return path.join(
    os.homedir(),
    '.config',
    'manicode' + (environment && environment !== 'prod' ? `-${environment}` : ''),
  )
}

// Wrapper that uses actual environment
export const getConfigDir = (): string => {
  return getConfigDirFromEnvironment(env.NEXT_PUBLIC_CB_ENVIRONMENT)
}
```

```typescript
// Tests can call the pure function directly
test('uses manicode-dev for dev environment', () => {
  const configDir = getConfigDirFromEnvironment('dev')
  expect(configDir).toContain('manicode-dev')
})

test('uses manicode for prod environment', () => {
  const configDir = getConfigDirFromEnvironment('prod')
  expect(configDir).toContain('manicode')
  expect(configDir).not.toContain('-dev')
})
```

## Mock Database Helpers

The `common/src/testing/mock-db.ts` module provides utilities for mocking database operations.

### Basic Usage

```typescript
import { createMockDb, createMockTransaction } from '@codebuff/common/testing/mock-db'
import { createMockUser, createMockCreditGrant } from '@codebuff/common/testing/fixtures'

// Create mock db with test data
const mockDb = createMockDb({
  users: [createMockUser({ id: 'user-123' })],
  creditGrants: [
    createMockCreditGrant({
      user_id: 'user-123',
      principal: 1000,
      balance: 800,
      type: 'free',
    }),
  ],
})

// Use in tests
const result = await calculateBalance({
  userId: 'user-123',
  deps: { db: mockDb },
})
```

### Tracking Database Operations

```typescript
import { createTrackedMockDb } from '@codebuff/common/testing/mock-db'

const { db, operations, getInserts, getUpdates } = createTrackedMockDb({
  users: [createMockUser()],
})

await someFunction({ deps: { db } })

// Assert on operations
expect(getInserts()).toHaveLength(1)
expect(getInserts()[0].values).toMatchObject({
  user_id: 'user-123',
  type: 'free',
})
```

### Mock Transaction

```typescript
import { createMockTransaction } from '@codebuff/common/testing/mock-db'

const mockTransaction = createMockTransaction({
  users: [createMockUser({ next_quota_reset: futureDate })],
})

const result = await triggerMonthlyResetAndGrant({
  userId: 'user-123',
  logger: testLogger,
  deps: { transaction: mockTransaction },
})
```

## Common Testing Scenarios

### Testing Billing Functions

```typescript
import { describe, expect, it } from 'bun:test'
import { testLogger, createMockUser } from '@codebuff/common/testing/fixtures'
import { createMockTransaction } from '@codebuff/common/testing/mock-db'

describe('triggerMonthlyResetAndGrant', () => {
  it('returns autoTopupEnabled from user', async () => {
    const mockTransaction = createMockTransaction({
      users: [createMockUser({
        next_quota_reset: futureDate,
        auto_topup_enabled: true,
      })],
    })

    const result = await triggerMonthlyResetAndGrant({
      userId: 'user-123',
      logger: testLogger,
      deps: { transaction: mockTransaction },
    })

    expect(result.autoTopupEnabled).toBe(true)
  })
})
```

### Testing Agent Runtime Functions

```typescript
import { describe, expect, it, spyOn } from 'bun:test'
import * as bigquery from '@codebuff/bigquery'
import { createTestAgentRuntimeParams } from '@codebuff/common/testing/fixtures'

describe('loopAgentSteps', () => {
  beforeEach(() => {
    // Use spyOn for imported modules
    spyOn(bigquery, 'insertTrace').mockImplementation(() => Promise.resolve(true))
  })

  it('calls LLM after STEP yield', async () => {
    const params = createTestAgentRuntimeParams({
      userId: 'test-user-id',  // Use inline string for test user IDs
      promptAiSdkStream: async function* () {
        yield { type: 'text', text: 'response' }
        yield createToolCallChunk('end_turn', {})
      },
    })

    const result = await loopAgentSteps(params)
    expect(result.agentState).toBeDefined()
  })
})
```

### Testing API Functions with Fetch

```typescript
import { describe, expect, it, mock } from 'bun:test'
import { testLogger } from '@codebuff/common/testing/fixtures'

describe('searchWeb', () => {
  it('handles successful response', async () => {
    const mockFetch = mock(() => Promise.resolve(
      new Response(JSON.stringify({ answer: 'test answer' }), { status: 200 })
    ))

    const result = await searchWeb({
      query: 'test',
      logger: testLogger,
      fetch: mockFetch,
      serverEnv: { LINKUP_API_KEY: 'test-key' },
      withTimeout: async (p) => p,  // Bypass timeout
    })

    expect(result).toBe('test answer')
    expect(mockFetch).toHaveBeenCalled()
  })
})
```

### Testing with Capturing Logger

```typescript
import { createCapturingLogger } from '@codebuff/common/testing/fixtures'

it('logs error on failure', async () => {
  const { logger, logs, getLogsByLevel } = createCapturingLogger()

  await functionThatLogs({ logger })

  expect(getLogsByLevel('error')).toHaveLength(1)
  expect(logs[0].msg).toContain('expected error message')
})
```

## Migration from mockModule

### Before (using mockModule)

```typescript
import { mockModule, clearMockedModules } from '@codebuff/common/testing/mock-modules'

beforeAll(async () => {
  await mockModule('@codebuff/bigquery', () => ({
    insertTrace: () => {},
  }))
})

afterAll(() => {
  clearMockedModules()
})
```

### After (using spyOn)

```typescript
import * as bigquery from '@codebuff/bigquery'

beforeEach(() => {
  spyOn(bigquery, 'insertTrace').mockImplementation(() => Promise.resolve(true))
})

afterEach(() => {
  mock.restore()
})
```

### Before (mocking utilities)

```typescript
beforeAll(async () => {
  await mockModule('@codebuff/common/util/promise', () => ({
    withTimeout: async (promise) => promise,
  }))
})
```

### After (using DI)

```typescript
// Add optional parameter to source function
export async function searchWeb(options: {
  // ... existing options
  withTimeout?: typeof defaultWithTimeout
}) {
  const { withTimeout = defaultWithTimeout } = options
  // ...
}

// In test
const result = await searchWeb({
  ...otherOptions,
  withTimeout: async (p) => p,
})
```

### Before (mocking environment)

```typescript
beforeEach(async () => {
  await mockModule('@codebuff/common/env', () => ({
    env: { NEXT_PUBLIC_CB_ENVIRONMENT: 'dev' },
  }))
})
```

### After (pure function extraction)

```typescript
// Source: extract pure function
export const getConfigDirFromEnvironment = (env: string | undefined) => { /* ... */ }

// Test: call pure function directly
test('uses dev directory', () => {
  expect(getConfigDirFromEnvironment('dev')).toContain('manicode-dev')
})
```

## Running Tests

```bash
# Run all tests
bun test

# Run specific package tests
bun test packages/billing
bun test packages/agent-runtime
bun test cli

# Run specific test file
bun test packages/billing/src/__tests__/grant-credits.test.ts

# Run with coverage
bun test --coverage
```

## Best Practices

1. **Keep fixtures minimal**: Only include what's needed for the test
2. **Use factory functions**: `createMockUser()` over hardcoded objects
3. **Prefer DI over mocking**: Add optional `deps` parameters to production code
4. **Use `spyOn` for module methods**: When you can't modify the source
5. **Avoid `mockModule` for functions**: It pollutes the module cache
6. **Clean up in `afterEach`**: Always call `mock.restore()` to prevent leaks
7. **Type your mocks**: Use proper TypeScript types for mock return values
