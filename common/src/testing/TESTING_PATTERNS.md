# Testing Patterns Guide

This guide documents best practices for writing tests in the Codebuff codebase, based on lessons learned from buffbench runs and production issues.

## Table of Contents

1. [Mock Cleanup](#mock-cleanup)
2. [Type-Safe Mocks](#type-safe-mocks)
3. [Assertion Best Practices](#assertion-best-practices)
4. [Test Isolation](#test-isolation)
5. [Common Patterns](#common-patterns)

---

## Mock Cleanup

### ❌ DON'T: Use `afterAll` for mock restoration

```typescript
// BAD: Mocks leak between tests
afterAll(() => {
  mockSpy.mockRestore()
})
```

### ✅ DO: Use `afterEach` for mock restoration

```typescript
// GOOD: Each test starts with clean state
afterEach(() => {
  mockSpy.mockRestore()
})
```

**Why**: `afterAll` runs only once after all tests complete. If one test modifies mock behavior, subsequent tests inherit that state, causing flaky tests and hard-to-debug failures.

---

## Type-Safe Mocks

### ❌ DON'T: Use `as any` casts for mocks

```typescript
// BAD: Type safety lost, bugs hide
spyOn(db, 'insert').mockReturnValue({
  values: mock(() => Promise.resolve({ id: 'test-id' })),
} as any)
```

### ✅ DO: Use typed mock factories

```typescript
// GOOD: Type-safe, reusable, documented
import { setupDbSpies } from '@codebuff/common/testing/mocks'

const dbSpies = setupDbSpies(db, { defaultInsertId: 'test-id' })
// dbSpies.insert is properly typed
```

### Available Mock Factories

```typescript
import {
  // Logger mocks
  createMockLogger,
  createMockLoggerWithCapture,

  // Analytics mocks
  createMockAnalytics,
  setupAnalyticsMocks,

  // Database mocks
  setupDbSpies,
  createMockDbOperations,

  // Crypto mocks
  setupCryptoMocks,
  createMockUuid,

  // Stream mocks
  createToolCallChunk,
  createMockStream,
} from '@codebuff/common/testing/mocks'
```

---

## Assertion Best Practices

### ❌ DON'T: Assert on raw strings with formatting

```typescript
// BAD: Brittle to whitespace/format changes
expect(JSON.stringify(result)).toContain('"role":"assistant"')
```

### ✅ DO: Parse JSON and assert on structured fields

```typescript
// GOOD: Robust to formatting changes
const parsed = JSON.parse(result)
expect(parsed.role).toBe('assistant')
expect(parsed.content).toHaveLength(1)
```

### ❌ DON'T: Use substring checks for role validation

```typescript
// BAD: False positives possible
expect(serializedHistory).toContain('assistant')
```

### ✅ DO: Check exact field values

```typescript
// GOOD: Precise and reliable
expect(messages.some((m) => m.role === 'assistant')).toBe(true)
```

---

## Test Isolation

### ❌ DON'T: Share mutable state between tests

```typescript
// BAD: Tests affect each other
let sharedState = { count: 0 }

it('test 1', () => {
  sharedState.count++
  expect(sharedState.count).toBe(1)
})

it('test 2', () => {
  // Fails if test 1 runs first!
  expect(sharedState.count).toBe(0)
})
```

### ✅ DO: Reset state in `beforeEach`

```typescript
// GOOD: Each test has fresh state
let state: { count: number }

beforeEach(() => {
  state = { count: 0 }
})

it('test 1', () => {
  state.count++
  expect(state.count).toBe(1)
})

it('test 2', () => {
  expect(state.count).toBe(0) // Works!
})
```

---

## Common Patterns

### Testing with Mock Logger

```typescript
import { createMockLoggerWithCapture } from '@codebuff/common/testing/mocks'

describe('myFunction', () => {
  it('logs errors appropriately', async () => {
    const { logger, getByLevel } = createMockLoggerWithCapture()

    await myFunction({ logger })

    const errors = getByLevel('error')
    expect(errors).toHaveLength(0) // No errors logged
  })
})
```

### Testing with Mock Analytics

```typescript
import { setupAnalyticsMocks } from '@codebuff/common/testing/mocks'
import * as analytics from '@codebuff/common/analytics'

describe('tracking', () => {
  let analyticsSpy: AnalyticsSpies

  beforeEach(() => {
    analyticsSpy = setupAnalyticsMocks(analytics)
  })

  afterEach(() => {
    analyticsSpy.restore()
  })

  it('tracks the event', async () => {
    await doSomething()
    expect(analyticsSpy.trackEvent).toHaveBeenCalledWith('something_done', {
      prop: 'value',
    })
  })
})
```

### Testing with Deterministic UUIDs

```typescript
import { setupCryptoMocks } from '@codebuff/common/testing/mocks'

describe('ID generation', () => {
  let cryptoSpies: CryptoMockSpies

  beforeEach(() => {
    cryptoSpies = setupCryptoMocks({ prefix: 'test', sequential: true })
  })

  afterEach(() => {
    cryptoSpies.restore()
  })

  it('creates items with sequential IDs', async () => {
    const item1 = await createItem()
    const item2 = await createItem()

    expect(item1.id).toBe('test-0000-0000-0000-000000000000')
    expect(item2.id).toBe('test-0000-0000-0000-000000000001')
  })
})
```

### Testing LLM Streams

```typescript
import {
  createMockStream,
  createTextChunk,
  createToolCallChunk,
  collectStreamChunks,
} from '@codebuff/common/testing/mocks'

describe('stream processing', () => {
  it('handles tool calls', async () => {
    const stream = createMockStream([
      createTextChunk('Analyzing...'),
      createToolCallChunk('read_files', { paths: ['test.ts'] }),
      createTextChunk('Done!'),
      createToolCallChunk('end_turn', {}),
    ])

    const { chunks } = await collectStreamChunks(stream)

    const toolCalls = chunks.filter((c) => c.type === 'tool-call')
    expect(toolCalls).toHaveLength(2)
    expect(toolCalls[0].toolName).toBe('read_files')
  })
})
```

### Testing Database Operations

```typescript
import { setupDbSpies } from '@codebuff/common/testing/mocks'
import db from '@codebuff/internal/db'

describe('data layer', () => {
  let dbSpies: DbSpies

  beforeEach(() => {
    dbSpies = setupDbSpies(db, { defaultInsertId: 'new-record-id' })
  })

  afterEach(() => {
    dbSpies.restore()
  })

  it('inserts a new record', async () => {
    const result = await createRecord({ name: 'Test' })

    expect(dbSpies.insert).toHaveBeenCalled()
    expect(result.id).toBe('new-record-id')
  })
})
```

---

## Additional Lessons from Buffbench

### Cross-Browser Styles

When adding custom scrollbar styles, always include Firefox support:

```css
/* WebKit (Chrome, Safari, Edge) */
::-webkit-scrollbar {
  width: 6px;
}

/* Firefox */
scrollbar-width: thin;
scrollbar-color: hsl(var(--border) / 0.6) transparent;
```

### Duplicate Code Detection

Before adding utility functions, search for existing implementations:

```bash
# Search for similar functions
rg "filterOutSystemRole\|filterSystem" --type ts
```

### Shared Mock File Context

Don't duplicate mock file context creators. Use the shared one:

```typescript
import { mockFileContext } from '@codebuff/common/testing/fixtures/agent-runtime'

// Don't create a new one in each test file
```

### Error Path Coverage

Always add tests for error scenarios:

```typescript
it('handles API errors gracefully', async () => {
  mockApi.mockRejectedValueOnce(new Error('Network error'))

  const result = await fetchData()

  expect(result.error).toBe('Network error')
})
```

---

## Migration Checklist

When updating tests to use these patterns:

1. [ ] Replace `as any` casts with typed mock factories
2. [ ] Move mock restoration from `afterAll` to `afterEach`
3. [ ] Replace string assertions with structured assertions
4. [ ] Use shared fixtures instead of duplicating mock data
5. [ ] Add error path coverage if missing
6. [ ] Ensure deterministic IDs with `setupCryptoMocks`
