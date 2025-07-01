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

## Testing

Mock database module directly, not getOrderedActiveGrants. Pass explicit 'now' parameter to control grant expiration.
