# Billing System

## Credit Purchase Flow

Credits are granted via webhook handlers, not API routes. Two payment flows:

1. Direct Payment (payment_intent.succeeded webhook)
2. Checkout Session (checkout.session.completed webhook)

Both require metadata: userId, credits, operationId, grantType

When granting credits:

1. Check for negative balances (debt)
2. If debt exists: Clear debt to 0, reduce grant by debt amount
3. Only create grant if amount > debt

## Refund Flow

1. charge.refunded webhook triggers
2. System looks up grant via operationId
3. Credits revoked by setting principal and balance to 0
4. Cannot revoke already-spent credits (negative balance)

## Credit Balance Design

Credits tracked in creditLedger table:

- principal: Initial amount (never changes)
- balance: Current remaining (can go negative)

Consumption order:

1. Priority (lower number = higher priority)
2. Expiration (soonest first, null expires_at treated as furthest future)
3. Creation date (oldest first)

Only last grant can go negative. No maximum debt limit enforced in code.

## Request Flow

1. User makes request
2. System calculates netBalance = totalRemaining - totalDebt
3. If auto-topup enabled and (debt exists OR balance below threshold): Try auto-topup
4. If netBalance <= 0: Block request
5. If allowed: Consume credits from grants in priority order

## Grant Types and Priorities

- free (20): Monthly free credits
- referral (40): Referral bonus credits
- admin (60): Admin-granted credits
- organization (70): Organization credits
- purchase (80): Purchased credits

## Auto Top-up

Triggers when:

- Enabled AND (balance below threshold OR debt exists)
- Valid payment method exists
- Amount >= 500 credits (minimum)
- If debt exists: amount = max(configured amount, debt amount)

## Testing with Dependency Injection

All billing functions support dependency injection (DI) via optional `deps` parameters, enabling comprehensive unit testing without mocking modules.

### DI Patterns

Each function accepts an optional `deps` object with injectable dependencies:

```typescript
// Example: Testing consumeCreditsAndAddAgentStep
await consumeCreditsAndAddAgentStep({
  messageId: 'test-msg',
  userId: 'user-1',
  // ... other params
  deps: {
    withSerializableTransaction: mockTransaction,
    trackEvent: vi.fn(),
    reportPurchasedCreditsToStripe: vi.fn(),
  },
})
```

### Available DI Interfaces

| Function | Deps Interface | Injectable Dependencies |
|----------|----------------|------------------------|
| `consumeCreditsAndAddAgentStep` | `ConsumeCreditsAndAddAgentStepDeps` | `withSerializableTransaction`, `trackEvent`, `reportPurchasedCreditsToStripe` |
| `calculateUsageThisCycle` | `CalculateUsageThisCycleDeps` | `db` |
| `validateAutoTopupStatus` | `ValidateAutoTopupStatusDeps` | `db`, `stripeServer` |
| `checkAndTriggerAutoTopup` | `CheckAndTriggerAutoTopupDeps` | `db`, `stripeServer`, `calculateUsageAndBalanceFn`, `validateAutoTopupStatusFn`, `processAndGrantCreditFn` |
| `checkAndTriggerOrgAutoTopup` | `CheckAndTriggerOrgAutoTopupDeps` | `db`, `stripeServer`, `calculateOrganizationUsageAndBalanceFn`, `grantOrganizationCreditsFn` |
| `reportPurchasedCreditsToStripe` | `ReportPurchasedCreditsToStripeDeps` | `db`, `stripeServer`, `shouldAttemptStripeMetering` |
| `getPreviousFreeGrantAmount` | `GetPreviousFreeGrantAmountDeps` | `db` |
| `calculateTotalReferralBonus` | `CalculateTotalReferralBonusDeps` | `db` |
| `processAndGrantCredit` | `ProcessAndGrantCreditDeps` | `grantCreditFn`, `logSyncFailure` |
| `syncOrganizationBillingCycle` | `SyncOrganizationBillingCycleDeps` | `db`, `stripeServer` |
| `findOrganizationForRepository` | `FindOrganizationForRepositoryDeps` | `db` |
| `consumeOrganizationCredits` | `ConsumeOrgCreditsDeps` | `withSerializableTransaction`, `trackEvent`, `reportToStripe` |
| `grantOrganizationCredits` | `GrantOrgCreditsDeps` | `db`, `transaction` |

### Functions with `conn` Parameter

Some functions accept a `conn` parameter for transaction context:

- `getOrderedActiveGrants({ userId, now, conn })` - Pass `tx` inside transactions
- `getOrderedActiveOrganizationGrants({ organizationId, now, conn })` - Same pattern
- `calculateUsageAndBalance({ ..., conn })` - Pass transaction for consistent reads

### Testing Best Practices

1. **Use `createMockBillingDb()`** from `@codebuff/common/testing/mock-db` for database mocking
2. **Pass explicit `now` parameter** to control grant expiration in tests
3. **Mock Stripe** by injecting a mock `stripeServer` via deps
4. **Use `vi.fn()`** for tracking function calls (analytics, Stripe reporting)

### Example Test

```typescript
import { createMockBillingDb } from '@codebuff/common/testing/mock-db'
import { checkAndTriggerAutoTopup } from '@codebuff/billing/auto-topup'

test('triggers auto-topup when balance is low', async () => {
  const mockDb = createMockBillingDb()
  const mockStripe = { paymentMethods: { list: vi.fn() }, ... }
  const mockCalculateBalance = vi.fn().mockResolvedValue({
    balance: { totalRemaining: 100, totalDebt: 0 }
  })

  await checkAndTriggerAutoTopup({
    userId: 'user-1',
    logger: mockLogger,
    deps: {
      db: mockDb,
      stripeServer: mockStripe,
      calculateUsageAndBalanceFn: mockCalculateBalance,
    },
  })

  expect(mockCalculateBalance).toHaveBeenCalled()
})
```
