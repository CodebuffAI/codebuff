# Billing DI Refactor Plan

## Overview

This plan outlines refactoring the billing and agent-runtime test infrastructure to use dependency injection (DI) instead of `mockModule`. The goal is to improve testability, reduce test flakiness, and separate test-only code from production code.

## Background

The original `billing-di-refactor` branch attempted this work but fell 166 commits behind main with merge conflicts in 12+ test files. This plan provides a fresh approach starting from main.

### Current State

- Tests use `mockModule` from `common/src/testing/mock-modules.ts` to mock database and billing modules
- The pattern requires `await mockModule(...)` in `beforeAll/beforeEach` and `clearMockedModules()` in `afterAll/afterEach`
- This causes module cache pollution between tests and makes tests order-dependent
- `TEST_USER_ID` is defined in `common/src/old-constants.ts` and used in production-adjacent test fixtures

### Target State

- Functions accept dependencies as parameters with typed contracts
- Tests pass mock implementations directly without module mocking
- Test fixtures are clearly separated from production code
- No `TEST_USER_ID` or similar test-only constants in production paths

---

## Phase 1: Billing Package DI Refactor

### 1.1 Create Contract Types for Billing Dependencies

**File:** `common/src/types/contracts/billing.ts`

Define function type contracts for billing operations:

```typescript
// Database operations used by billing
export type GetCreditGrantsFn = (params: {
  organizationId?: string
  userId?: string
}) => Promise<CreditGrant[]>

export type InsertCreditGrantFn = (grant: NewCreditGrant) => Promise<void>

export type UpdateCreditGrantFn = (
  grantId: string,
  updates: Partial<CreditGrant>
) => Promise<void>

// Transaction wrapper
export type WithTransactionFn = <T>(
  callback: (tx: TransactionClient) => Promise<T>
) => Promise<T>
```

### 1.2 Refactor `grant-credits.ts`

**Current signature:**
```typescript
export async function triggerMonthlyResetAndGrant(params: {
  userId: string
  logger: Logger
}): Promise<{ quotaResetDate: Date; autoTopupEnabled: boolean }>
```

**New signature with DI:**
```typescript
export type TriggerMonthlyResetAndGrantDeps = {
  db?: DatabaseClient  // Optional, defaults to real db
  logger?: Logger      // Optional, defaults to real logger
}

export async function triggerMonthlyResetAndGrant(params: {
  userId: string
  deps?: TriggerMonthlyResetAndGrantDeps
}): Promise<{ quotaResetDate: Date; autoTopupEnabled: boolean }>
```

### 1.3 Refactor `org-billing.ts`

Add optional dependency injection for:
- `calculateOrganizationUsageAndBalance`
- `consumeOrganizationCredits`
- `grantOrganizationCredits`

### 1.4 Refactor `credit-delegation.ts`

Add optional dependency injection for:
- `findOrganizationForRepository`
- `consumeCreditsWithDelegation`

### 1.5 Refactor `usage-service.ts`

Add optional dependency injection for:
- `getUserUsageData`

### 1.6 Update Billing Tests

**Current pattern (to remove):**
```typescript
beforeEach(async () => {
  await mockModule('@codebuff/internal/db', () => ({
    default: createDbMock(),
  }))
})

afterEach(() => {
  clearMockedModules()
})
```

**New pattern:**
```typescript
const mockDb = createMockDb()

test('should calculate balance', async () => {
  const result = await calculateOrganizationUsageAndBalance({
    organizationId: 'org-123',
    deps: { db: mockDb, logger: testLogger }
  })
  expect(result.balance.netBalance).toBe(700)
})
```

---

## Phase 2: Agent Runtime Test Refactor

### 2.1 Remove `TEST_USER_ID` Usage

**Current usage in `fast-rewrite.test.ts`:**
```typescript
import { TEST_USER_ID } from '@codebuff/common/old-constants'
// ...
userId: TEST_USER_ID,
```

**Replace with:**
```typescript
// Use the test fixture constant instead
userId: 'test-user-id',  // or import from test fixtures
```

### 2.2 Consolidate Test Database Mocks

Create a shared mock database helper in `common/src/testing/`:

**File:** `common/src/testing/mock-db.ts`

```typescript
export type MockDbConfig = {
  users?: MockUser[]
  creditGrants?: MockCreditGrant[]
  organizations?: MockOrganization[]
}

export function createMockDb(config: MockDbConfig = {}): MockDatabaseClient {
  return {
    select: () => ({ from: () => ({ where: () => config.users ?? [] }) }),
    insert: () => ({ values: () => Promise.resolve() }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    transaction: async (callback) => callback(createMockDb(config)),
  }
}
```

### 2.3 Update Agent Runtime Tests

Files to update:
- `packages/agent-runtime/src/__tests__/fast-rewrite.test.ts`
- `packages/agent-runtime/src/__tests__/loop-agent-steps.test.ts`
- `packages/agent-runtime/src/__tests__/main-prompt.test.ts`
- `packages/agent-runtime/src/__tests__/n-parameter.test.ts`
- `packages/agent-runtime/src/__tests__/read-docs-tool.test.ts`
- `packages/agent-runtime/src/__tests__/run-agent-step-tools.test.ts`
- `packages/agent-runtime/src/__tests__/run-programmatic-step.test.ts`
- `packages/agent-runtime/src/__tests__/web-search-tool.test.ts`

---

## Phase 3: Environment Variable Cleanup

### 3.1 Make Required Env Vars Explicit

Update `common/src/env-schema.ts` and `packages/internal/src/env-schema.ts`:

- Make `POSTHOG_API_KEY` required (no default)
- Make `STRIPE_CUSTOMER_PORTAL` required (no default)
- Remove defaults from client env vars that should always be set

### 3.2 Add Graceful Fallbacks

For client-side code that runs before env is loaded, add explicit undefined checks rather than relying on defaults:

```typescript
// Before
const url = env.NEXT_PUBLIC_CODEBUFF_APP_URL // might crash if undefined

// After
const url = env.NEXT_PUBLIC_CODEBUFF_APP_URL ?? 'https://codebuff.com'
```

---

## Phase 4: Testing Infrastructure Cleanup

### 4.1 Consolidate Testing Exports

Ensure all test utilities are exported from two main entry points:

1. `@codebuff/common/testing` - For general test utilities
2. `@codebuff/common/testing/fixtures` - For test data fixtures

### 4.2 Use Barrel Imports

Create barrel exports for test fixtures:

**File:** `common/src/testing/fixtures/index.ts`
```typescript
export * from './agent-runtime'
export * from './billing'  // New
export * from './database'  // New
```

### 4.3 Remove Test-Only Constants from Production

Move or remove from `common/src/old-constants.ts`:
- `TEST_USER_ID` - Move to test fixtures only

---

## Implementation Order

Execute in this order to minimize conflicts and allow incremental testing:

1. **Create contract types** (`common/src/types/contracts/billing.ts`)
2. **Create mock database helper** (`common/src/testing/mock-db.ts`)
3. **Refactor `grant-credits.ts`** with optional DI + update tests
4. **Refactor `org-billing.ts`** with optional DI + update tests
5. **Refactor `credit-delegation.ts`** with optional DI + update tests
6. **Refactor `usage-service.ts`** with optional DI + update tests
7. **Update agent-runtime tests** to remove `mockModule` usage
8. **Clean up environment variables**
9. **Remove `TEST_USER_ID`** from old-constants
10. **Final cleanup** - consolidate exports, update barrel files

---

## Validation Checklist

After each step, verify:

- [ ] `bun run typecheck` passes
- [ ] `bun test packages/billing` passes
- [ ] `bun test packages/agent-runtime` passes
- [ ] No `mockModule` imports remain in refactored files
- [ ] No `TEST_USER_ID` imports from `old-constants` in test files

---

## Files to Modify

### New Files
- `common/src/types/contracts/billing.ts`
- `common/src/testing/mock-db.ts`
- `common/src/testing/fixtures/billing.ts`
- `common/src/testing/fixtures/index.ts`

### Billing Package
- `packages/billing/src/grant-credits.ts`
- `packages/billing/src/org-billing.ts`
- `packages/billing/src/credit-delegation.ts`
- `packages/billing/src/usage-service.ts`
- `packages/billing/src/__tests__/grant-credits.test.ts`
- `packages/billing/src/__tests__/org-billing.test.ts`
- `packages/billing/src/__tests__/credit-delegation.test.ts`
- `packages/billing/src/__tests__/usage-service.test.ts`

### Agent Runtime Package
- `packages/agent-runtime/src/__tests__/fast-rewrite.test.ts`
- `packages/agent-runtime/src/__tests__/loop-agent-steps.test.ts`
- `packages/agent-runtime/src/__tests__/main-prompt.test.ts`
- `packages/agent-runtime/src/__tests__/n-parameter.test.ts`
- `packages/agent-runtime/src/__tests__/read-docs-tool.test.ts`
- `packages/agent-runtime/src/__tests__/run-agent-step-tools.test.ts`
- `packages/agent-runtime/src/__tests__/run-programmatic-step.test.ts`
- `packages/agent-runtime/src/__tests__/web-search-tool.test.ts`

### Common Package
- `common/src/old-constants.ts` (remove `TEST_USER_ID`)
- `common/src/env-schema.ts` (tighten defaults)

### Other Test Files Using mockModule
- `cli/src/__tests__/integration/credentials-storage.test.ts`
- `packages/agent-runtime/src/llm-api/__tests__/linkup-api.test.ts`
- `sdk/src/__tests__/code-search.test.ts`
- `web/src/lib/__tests__/ban-conditions.test.ts`

---

## Example: Complete DI Pattern

Here's a complete example of the target pattern for `grant-credits.ts`:

```typescript
// grant-credits.ts
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { DatabaseClient } from '@codebuff/common/types/contracts/database'
import db from '@codebuff/internal/db'
import { logger as defaultLogger } from '@codebuff/internal/logger'

export type TriggerMonthlyResetAndGrantDeps = {
  db?: DatabaseClient
  logger?: Logger
}

export async function triggerMonthlyResetAndGrant(params: {
  userId: string
  deps?: TriggerMonthlyResetAndGrantDeps
}): Promise<{ quotaResetDate: Date; autoTopupEnabled: boolean }> {
  const { userId, deps = {} } = params
  const { db: database = db, logger = defaultLogger } = deps

  // Implementation uses `database` and `logger` instead of imports
  const user = await database.query.user.findFirst({
    where: eq(userTable.id, userId),
  })
  
  // ... rest of implementation
}
```

```typescript
// grant-credits.test.ts
import { describe, expect, it } from 'bun:test'
import { triggerMonthlyResetAndGrant } from '../grant-credits'
import { testLogger } from '@codebuff/common/testing/fixtures/agent-runtime'
import { createMockDb } from '@codebuff/common/testing/mock-db'

describe('triggerMonthlyResetAndGrant', () => {
  it('should return autoTopupEnabled: true when enabled', async () => {
    const mockDb = createMockDb({
      users: [{
        id: 'user-123',
        next_quota_reset: futureDate,
        auto_topup_enabled: true,
      }]
    })

    const result = await triggerMonthlyResetAndGrant({
      userId: 'user-123',
      deps: { db: mockDb, logger: testLogger }
    })

    expect(result.autoTopupEnabled).toBe(true)
  })
})
```

---

## Notes

- **Backward Compatibility:** All dependency parameters should be optional with sensible defaults to avoid breaking existing call sites
- **Incremental Migration:** Each file can be migrated independently - tests can be updated one at a time
- **Type Safety:** Use contract types from `common/src/types/contracts/` for all injected dependencies
- **Testing Pattern:** Follow the pattern established in `cli/src/hooks/use-auth-query.ts` which already uses DI successfully
