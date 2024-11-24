# Billing and Usage Tracking in Codebuff

## Overview

This document outlines the billing system and usage tracking implementation for the Codebuff project. It covers key components, database schema, quota management, and integration points.

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

#### Data Flow Principles

- Propagate data through existing query chains instead of making new DB queries
- When checking quota status, include all relevant user state (subscription status, etc.)
- Pass complete state through websocket messages to avoid redundant DB calls
- Example: subscription status flows from quota check → usage response → client display

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
- Subscription and quota status must flow from backend to client via websocket messages:
  - Backend determines subscription status and quota state
  - Communicates via 'usage-response' message type
  - Client displays appropriate messages based on backend response
  - Never implement quota/subscription logic directly in client
- Display different messages for subscribed vs non-subscribed users:
  - Subscribed: Show usage exceeded but allow continued use
  - Non-subscribed: Show usage exceeded and block further use

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

### Usage Metering

Important: When sending meter events to Stripe:

- Send events for all users - Stripe automatically filters events outside billing period
- No need for rate limiting - Stripe's API designed for high volume
- Events before subscription starts are ignored by Stripe
- Keep implementation simple - avoid premature optimization like batching or complex helper functions
- Prefer async operations that don't block the main flow

## Client-Side Integration

The client (`npm-app/src/client.ts`) handles:

- User authentication and login.
- Displaying usage warnings to users.
- Subscription to usage updates from the server.
- Credit tracking:
  - Server returns total credits used in session
  - Client calculates per-request usage by comparing new total with cached value
  - Important: Use delta between totals to show credits used per request
- Credit tracking:
  - Server returns total credits used in session
  - Client calculates per-request usage by comparing new total with cached value
  - Important: Use delta between totals to show credits used per request

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
6. Keep methods focused:
   - Calculation logic belongs in the caller, not the setter methods
   - Setters should only handle database updates
   - Getters should return all data needed for business logic
7. Code Style:
   - Prefer explicit variable declarations over nested ternaries for quota logic
   - Add descriptive comments explaining quota state changes
   - Use clear variable names that reflect their purpose in quota management
   - Example: Separate endDate handling with explanatory comments rather than combining in a ternary
   - Prefer explicit if statements with comments over ternaries for complex state changes
   - Document the reason for state changes (e.g., "endDate is in the past, so we should reset the quota")
   - Prefer explicit if statements with comments over ternaries for complex state changes
   - Document the reason for state changes (e.g., "endDate is in the past, so we should reset the quota")
   - Prefer explicit if statements with comments over ternaries for complex state changes
   - Document the reason for state changes (e.g., "endDate is in the past, so we should reset the quota")
8. Combine related database queries into single operations:
   - Methods should return all necessary data in one query
   - Avoid separate queries for related data (e.g., subscription status with quota info)
   - Example: checkQuota returns quota and subscription status together
9. Test all billing code paths thoroughly:
   - Test both anonymous and authenticated users
   - Verify subscription status handling
   - Test quota exceeded scenarios
   - Test edge cases like subscription transitions
   - Add integration tests for full quota check flow

## Future Considerations

1. Implement more granular quota controls (e.g., per-feature quotas).
2. Develop a caching layer for frequent quota checks to reduce database load.
3. Implement real-time quota updates for improved user experience.
4. Expand Stripe integration to handle more complex billing scenarios.
5. Develop a system for usage analytics to inform pricing strategies.
