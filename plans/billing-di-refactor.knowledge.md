# Billing DI Refactor - Context & Knowledge

## Quick Start

This worktree is for implementing dependency injection (DI) patterns in the billing and testing infrastructure.

**Start by reading:** `plans/billing-di-refactor.md` for the full implementation plan.

## Why This Refactor?

### Problem: `mockModule` Pattern Issues

The current test pattern using `mockModule` from `common/src/testing/mock-modules.ts` has issues:

1. **Module cache pollution** - Mocks persist between tests causing flaky tests
2. **Order dependency** - Tests may pass/fail depending on execution order
3. **Complex setup/teardown** - Requires `beforeAll/afterAll` boilerplate
4. **Re-import requirement** - Must re-import modules after mocking

### Solution: Dependency Injection

Functions accept dependencies as optional parameters with sensible defaults:

```typescript
// Before: Hard to test
export async function myFunction(userId: string) {
  const user = await db.query.user.findFirst({ where: eq(userTable.id, userId) })
  logger.info('Found user', { userId })
  return user
}

// After: Easy to test
export async function myFunction(params: {
  userId: string
  deps?: { db?: DatabaseClient; logger?: Logger }
}) {
  const { userId, deps = {} } = params
  const { db: database = db, logger = defaultLogger } = deps
  
  const user = await database.query.user.findFirst({ where: eq(userTable.id, userId) })
  logger.info('Found user', { userId })
  return user
}
```

## Existing DI Patterns to Follow

### 1. CLI Hooks Pattern (use-auth-query.ts)

```typescript
export interface UseAuthQueryDeps {
  getUserCredentials?: () => User | null
  getUserInfoFromApiKey?: GetUserInfoFromApiKeyFn
  logger?: Logger
}

export function useAuthQuery(deps: UseAuthQueryDeps = {}) {
  const {
    getUserCredentials = defaultGetUserCredentials,
    getUserInfoFromApiKey = defaultGetUserInfoFromApiKey,
    logger = defaultLogger,
  } = deps
  // ... use deps instead of direct imports
}
```

### 2. Contract Types Pattern (common/src/types/contracts/)

Define function type contracts for dependencies:

```typescript
// common/src/types/contracts/database.ts
export type GetUserInfoFromApiKeyFn = <T extends UserColumn>(
  params: GetUserInfoFromApiKeyInput<T>
) => Promise<Pick<User, T> | null>
```

### 3. Test Fixtures Pattern (common/src/testing/fixtures/)

```typescript
// common/src/testing/fixtures/agent-runtime.ts
export const testLogger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

export const TEST_AGENT_RUNTIME_IMPL = Object.freeze<AgentRuntimeDeps>({
  logger: testLogger,
  // ... other mock dependencies
})
```

## Files Using mockModule (Need Refactoring)

These files currently use `mockModule` and need to be converted:

### Billing Package (Priority)
- `packages/billing/src/__tests__/grant-credits.test.ts`
- `packages/billing/src/__tests__/org-billing.test.ts`
- `packages/billing/src/__tests__/credit-delegation.test.ts`
- `packages/billing/src/__tests__/usage-service.test.ts`

### Agent Runtime Package
- `packages/agent-runtime/src/__tests__/fast-rewrite.test.ts`
- `packages/agent-runtime/src/__tests__/loop-agent-steps.test.ts`
- `packages/agent-runtime/src/__tests__/process-file-block.test.ts`
- `packages/agent-runtime/src/llm-api/__tests__/linkup-api.test.ts`

### Other Packages
- `cli/src/__tests__/integration/credentials-storage.test.ts`
- `sdk/src/__tests__/code-search.test.ts`
- `web/src/lib/__tests__/ban-conditions.test.ts`

## Constants to Remove

`TEST_USER_ID` in `common/src/old-constants.ts` should be removed from production code and only defined in test fixtures.

## Validation Commands

After making changes, run:

```bash
# Typecheck everything
bun run typecheck

# Test billing package
bun test packages/billing

# Test agent-runtime package
bun test packages/agent-runtime

# Test specific file
bun test packages/billing/src/__tests__/grant-credits.test.ts
```

## Tips

1. **Start small** - Refactor one function at a time
2. **Keep backward compatible** - All deps should be optional with defaults
3. **Update tests immediately** - After adding DI to a function, update its tests
4. **Use existing patterns** - Look at `use-auth-query.ts` as a reference
5. **Type everything** - Use contract types from `common/src/types/contracts/`
