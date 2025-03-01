# Billing System

## Core Components

- QuotaManager: Tracks usage limits
- MessageCostTracker: Calculates costs
- Stripe: Subscription management

## Usage Tracking

- Track credits used per request
- Store usage in database
- Send usage to Stripe for billing
- Record usage before subscription changes

## Subscription Changes

- Preserve usage data during plan changes
- Handle immediate vs scheduled cancellations
- Record usage under new plan after upgrade
- Log detailed context for billing errors

## Referral System

- Track successful referrals (max 5)
- Add referral credits to quota
- Preserve credits through plan changes
- Apply credits before overage charges

## Error Recovery

- Log detailed context for manual fixes
- Show user-friendly error messages
- Include support contact info
- Don't retry usage recording failures
