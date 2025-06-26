# Billing System

## Credit Purchase Flow

Important: Credits must only be granted via webhook handlers, never in API routes. There are two payment flows:

1. Direct Payment (payment_intent.succeeded webhook)
2. Checkout Session (checkout.session.completed webhook)

Both flows must:
- Include metadata: userId, credits, operationId, grantType
- Only grant credits when payment is confirmed
- Use the same operationId throughout the flow
- Log all steps for debugging

When granting credits:
1. Check for any negative balances (debt)
2. If debt exists:
   - Clear all negative balances to 0
   - Reduce new grant amount by total debt
   - Add note to grant description about debt clearance
   - Only create grant if amount > debt
3. If no debt:
   - Create grant normally

## Refund Flow

When a refund is issued in Stripe:
1. charge.refunded webhook triggers
2. System looks up original grant via operationId
3. Credits are revoked by setting balance to 0
4. Cannot revoke already-spent credits (negative balance)
5. Original grant record preserved with refund note

## Credit Balance Design

- Credits are tracked in the creditLedger table
- Each grant has:
  - principal: Initial grant amount, never changes
  - balance: Current remaining amount (can go negative)
- Usage is calculated as (principal - balance) for each grant
- When consuming credits:
  - System calculates netBalance = totalRemaining - totalDebt
  - If netBalance <= 0, request is blocked
  - Otherwise, consume from remaining grants in order:
    1. Expiring soonest first (never-expiring last)
    2. Within same expiry, by priority (free -> referral -> purchase -> admin)
    3. Within same priority, oldest first (by created_at)

  Example:
    debt: -20
    referral (2024-02-01): 30
    free (2024-03-01): 50

    netBalance = (30 + 50) - 20 = 60
    Request allowed, will consume from referral first

  - Skip grants with 0 or negative balance when consuming
  - Only let the last grant go negative
  - Principal stays at original value
  - Never create new grants for debt
  - Maximum debt limit of 100 credits per user
  - If a request would exceed max debt limit, it's truncated and fails

## Testing

When testing balance calculation:
- Mock the database module directly, not getOrderedActiveGrants
- Return all grants in mock data, even expired ones
- Let calculateUsageAndBalance handle expiration logic
- Pass explicit 'now' parameter to control when grants expire
- Example:
  ```typescript
  mock.module('@codebuff/common/db', () => ({
    default: {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => mockGrants,
          }),
        }),
      }),
    },
  }))
  ```

## Request Flow

1. User makes a request
2. System checks balance:
   - Calculate netBalance = totalRemaining - totalDebt
   - If auto-topup enabled:
     - If debt exists OR balance below threshold: Try auto-topup
     - If auto-topup succeeds: Recalculate netBalance
   - If netBalance <= 0: Block request
3. If allowed, system:
   - Calculates credit cost based on tokens used
   - Consumes from grants in expiry + priority order
   - Only last grant can go negative (up to max debt limit)
   - Shows updated balance/debt to user

## Grant Types and Priorities

Lower number = higher priority:
- free (20): Monthly free credits
- referral (40): Referral bonus credits
- purchase (60): Purchased credits
- admin (80): Admin-granted credits

Note: Priority only matters for grants with same expiration date.

## Auto Top-up

Auto top-up triggers when:
- User has enabled the feature AND either:
  1. Balance drops below threshold, OR
  2. User has any debt
- User has valid payment method
- Amount is >= minimum purchase (500 credits)
- If user has debt, top-up amount is max(configured amount, debt amount)
- Settings:
  - Threshold: 100-10,000 credits
  - Amount: $5-$100
  - Settings are saved after 750ms of no changes
  - Invalid settings prevent enabling
  - Blocked users cannot enable (e.g. payment failed)

## Stripe Integration

- Usage is synced to Stripe meter events
- Failed syncs are retried up to 5 times
- Each credit has a monetary cost based on user's plan
