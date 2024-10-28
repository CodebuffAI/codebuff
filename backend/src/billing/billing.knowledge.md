# Billing and Usage Tracking in Manicode

## Overview

This document outlines the billing system and usage tracking implementation for the Manicode project. It covers key components, database schema, quota management, and integration points.

## Key Components

1. **QuotaManager**: Manages user quotas for both anonymous and authenticated users.
2. **MessageCostTracker**: Calculates and saves costs for user messages.
3. **Stripe Integration**: Handles subscription management and payment processing.

## Database Schema

The database schema includes tables for users, messages, and fingerprints:

- `user`: Stores user information, including quota and subscription details.
- `message`: Tracks individual message costs and usage.
- `fingerprint`: Manages anonymous user tracking.

Key fields in the `user` table:

- `quota`: User's credit limit.
- `quota_exceeded`: Boolean flag for quota status.
- `next_quota_reset`: Timestamp for the next quota reset.
- `subscription_active`: Indicates if the user has an active paid subscription.
- `stripe_customer_id`: Links to Stripe customer.
- `stripe_price_id`: Identifies the user's subscription plan.

## Quota Management

### QuotaManager

Two implementations:

1. `AnonymousQuotaManager`: For unauthenticated users.
2. `AuthenticatedQuotaManager`: For authenticated users.

Key methods:

- `updateQuota`: Updates user's quota after usage.
- `checkQuota`: Verifies if a user has exceeded their quota. Important: Active subscriptions always bypass quota exceeded checks.
- `resetQuota`: Resets quota at the end of a billing cycle.

### Subscription Status

- Active subscriptions completely bypass quota exceeded checks
- Non-subscribed users are blocked when exceeding their quota
- Quota tracking continues even when checks are bypassed for billing purposes

### Subscription Status

- Active subscriptions completely bypass quota exceeded checks
- Non-subscribed users are blocked when exceeding their quota
- Quota tracking continues even when checks are bypassed for billing purposes

### Usage Limits

Defined in `common/src/constants.ts`:

- ANON: 1,000 credits
- FREE: 2,500 credits
- PAID: 50,000 credits

## Cost Calculation

`MessageCostTracker` in `message-cost-tracker.ts` handles cost calculations:

- Uses different rates for input and output tokens.
- Applies a profit margin to the calculated cost.
- Saves message details including tokens used and credits consumed.

## Stripe Integration

Stripe webhooks (`web/src/app/api/stripe/webhook/route.ts`) handle:

- Subscription creation, updates, and deletions.
- Invoice payments.

Key functions:

- `handleSubscriptionChange`: Updates user quota and subscription status.
- `handleInvoicePaid`: Resets quota and updates subscription status on payment.

## Client-Side Integration

The client (`npm-app/src/client.ts`) handles:

- User authentication and login.
- Displaying usage warnings to users.
- Subscription to usage updates from the server.

## WebSocket Communication

WebSocket actions (`backend/src/websockets/websocket-action.ts`) manage:

- Sending usage updates to clients.
- Handling user input and checking quotas before processing.

## Best Practices

1. Always use `getQuotaManager` to obtain the correct quota manager instance.
2. Perform quota checks before processing expensive operations.
3. Update quotas after successful operations that consume credits.
4. Ensure proper error handling for quota exceeded scenarios.
5. Regularly review and adjust pricing and quota limits based on usage patterns.

## Future Considerations

1. Implement more granular quota controls (e.g., per-feature quotas).
2. Develop a caching layer for frequent quota checks to reduce database load.
3. Implement real-time quota updates for improved user experience.
4. Expand Stripe integration to handle more complex billing scenarios.
5. Develop a system for usage analytics to inform pricing strategies.
