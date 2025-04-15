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
  - First check if user has any debt - if yes, block usage
  - Then consume from remaining grants in order:
    1. Expiring soonest first (never-expiring last)
    2. Within same expiry, by priority (free -> referral -> purchase -> admin)
    3. Within same priority, oldest first
  - Example:
    ```
    Initial state:
    free (NULL): -20 (debt)
    referral (2024-02-01): 30
    free (2024-03-01): 50
    
    Result: Request blocked due to debt
    System tries auto-topup to clear debt if enabled
    If auto-topup fails, user must manually add credits
    ```
  - Skip grants with 0 or negative balance when consuming
  - Only let the last grant go negative
  - Principal stays at original value
  - Never create new grants for debt
  - Users cannot use any credits if they have debt
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
  mock.module('common/db', () => ({
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
   - If user has any debt: Try auto-topup, then block if still insufficient
   - If totalRemaining <= 0: Try auto-topup, then block if still insufficient
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

## Stripe Integration

- Usage is synced to Stripe meter events
- Failed syncs are retried up to 5 times
- Each credit has a monetary cost based on user's plan
