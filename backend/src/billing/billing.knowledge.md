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

### Subscription Migrations

Important: When handling multiple subscription tiers:
- Each subscription tier needs both a base price ID and an overage price ID
- When updating subscriptions, both price IDs must be updated together
- Never rely on array position to identify subscription items
- Always check price.recurring.usage_type to identify 'licensed' vs 'metered' items
- Both licensed (base) and metered (overage) items must exist for valid subscription
- Verify metered item exists before recording usage or updating subscription
- When validating current plan, check both licensed and metered price IDs match

Important: When organizing subscription-related code:
- Extract price ID mapping into reusable functions to avoid duplication
- Check authentication before any other validation
- Validate plan changes before checking subscription status
- Validate target plan differs from current plan to prevent unnecessary operations
- Handle unpaid invoices check as early as possible
- Keep subscription item order consistent (licensed first, metered second)
- Capture usage data before any subscription changes

Important: When changing subscription tiers:
- Capture total usage before updating subscription, as usage records may become inaccessible after plan change
- Record old usage under new plan immediately after upgrade to preserve history
- Check for unpaid invoices before allowing plan changes
- Use proration_behavior: 'always_invoice' to generate immediate charges

Important: When migrating subscriptions to new prices:
- Preserve existing usage meter records for 'Credits'
- Don't reset usage data during price changes
- Ensure fair billing by carrying forward accumulated usage
- Usage data should persist across subscription updates
- Use the dedicated credits meter ID (mtr_test_61RUgv7ouoAAMKoE341KrNS6SjmqWUXA) when tracking usageWhen preserving usage data during migrations:
- Use billing.meters.event_summaries endpoint to get historical usage
- Calculate usage from start of current invoice period
- This ensures accurate billing across subscription changes
- Important: Record usage before updating subscription items to prevent gaps in billing

Important: When recording usage:
- Use billing.meterEvents.create instead of subscriptionItems.createUsageRecord
- The legacy usage record system is being deprecated
- Example:
  ```typescript
  await stripeServer.billing.meterEvents.create({
    event_name: 'credits',
    timestamp: Math.floor(new Date().getTime() / 1000),
    payload: {
      stripe_customer_id: customerId,
      value: totalUsage.toString(),
    },
  })
  ```
- When getting usage totals:
  ```typescript
### Usage Tracking

Important: When tracking usage:
- Use QuotaManager to get usage data instead of querying Stripe directly
- QuotaManager provides more accurate data as it includes all usage from our database
- Stripe usage records may lag behind our actual usage data
- Example:
  ```typescript
  const quotaManager = new AuthenticatedQuotaManager()
  const { creditsUsed } = await quotaManager.checkQuota(userId)
  ```
  ```
- When preserving usage data during migrations:
  - Use billing.meters.event_summaries endpoint to get historical usage
  - Calculate usage from start of current invoice period
  - This ensures accurate billing across subscription changes
  - Important: Record usage before updating subscription items to prevent gaps in billing

When preserving usage data during migrations:

- Use billing.meterEvents.create to record usage
- Required payload fields:
  - event_name: The meter name (e.g. 'credits')
  - payload.stripe_customer_id: Customer's ID
  - payload.value: Usage amount to record
- This ensures usage history is maintained when moving customers between subscription tiers
- Important: Record usage before updating subscription items to prevent gaps in billing
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

## Usage Limit Handling

- The system tracks user usage and compares it against their quota limit.
- Warning messages are shown at 25%, 50%, and 75% of the usage limit.
- When a user reaches or exceeds 100% of their usage limit:
  - An error message MUST ALWAYS be displayed to the user.
  - This error message should inform the user that they've reached their monthly limit.
  - For logged-in users, provide a link to the pricing page for upgrades.
  - For anonymous users, prompt them to log in for more credits.
  - If available, include a referral link for additional credits.

## Overage Charge Display

When showing billing information to users:
- Lead with immediate charge and explain proration
- Show monthly estimate with explicit start date
- Break down charges into base rate and overages
- Show rate comparisons inline with the charges they affect
- Use color to highlight savings (green) and costs (amber)
- Add brief explanatory notes about billing timing
- Display individual line items from Stripe invoice previews:
  - Show each line item with description and amount
  - Use green text for credits (negative amounts)
  - Group charges and credits separately with visual separation
  - Show date ranges for each line item when available
  - Convert all amounts from cents to dollars
  - Label credits section as "Credits & Adjustments"
  - Calculate total amount from line items rather than using preview.amount_due
  - Remove redundant total fields when line items contain the same information

## Savings Presentation

When highlighting cost savings:
- Place savings message between total amount and breakdown
- Use visual distinction (e.g., colored background) to draw attention
- Split into "what changed" and "what you save" for clarity
- Include timeframe context ("monthly at current usage")
- Use side-by-side layout to show rate change and total savings

## Overage Rate Calculation

Important: When calculating overage rates:
- Use the metered price item, not the base subscription price
- Compare against overage price IDs (e.g. STRIPE_PRO_OVERAGE_PRICE_ID)
- Always verify metered item exists before accessing

## Proration Calculations

Important: When calculating prorated charges:
- Always use new Date().getTime() instead of Date.now() for UTC consistency
- Get unused credits from Stripe's preview.lines.data amounts
- Sum all line amounts - negative values automatically become credits
- Convert from cents to dollars by dividing by 100
- Use licensed item (not array index) for base price calculations

### Plan Change Behavior

Important: When determining upgrade vs downgrade:
- Never parse price IDs or amounts from Stripe - these are just identifiers
- Instead, use PLAN_CONFIGS to compare monthly prices between plans
- Map Stripe price IDs to plan names, then compare plan configs:
  ```typescript
  const currentPlanName = priceId === env.STRIPE_PRO_PRICE_ID ? 'Pro' : 'Moar Pro'
  const isDowngrade = changeOrUpgrade(currentPlanName, targetPlan) === 'change'
  ```

Important: Different proration behavior for upgrades vs downgrades:
- For upgrades: Use `proration_behavior: 'always_invoice'`
  - Takes effect immediately
  - Charges prorated amount for new plan
  - Credits unused time on old plan
- For downgrades: Use `proration_behavior: 'none'`
  - Changes take effect at end of billing period
  - No immediate refunds
  - Prevents upgrade/downgrade cycling for partial period credits

Important: When handling multiple subscription tiers:
- Each subscription tier needs both a base price ID and an overage price ID
- When updating subscriptions, both price IDs must be updated together
- Never rely on array position to identify subscription items
- Always check price.recurring.usage_type to identify 'licensed' vs 'metered' items
- Both licensed (base) and metered (overage) items must exist for valid subscription
- Verify metered item exists before recording usage or updating subscription

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

### Subscription Migrations

Important: When migrating subscriptions to new prices:
- Preserve existing usage meter records for 'Credits'
- Don't reset usage data during price changes
- Ensure fair billing by carrying forward accumulated usage
- Usage data should persist across subscription updates
- Use the dedicated credits meter ID (mtr_test_61RUgv7ouoAAMKoE341KrNS6SjmqWUXA) when tracking usage

### Edge Cases in Plan Changes

Critical considerations when handling subscription updates:

1. Usage Migration Safety:
   - Always capture total usage before updating subscription
   - Record old usage under new plan immediately after upgrade
   - Consider implementing rollback mechanism for failed migrations

2. Concurrent Updates:
   - Implement request deduplication or locking
   - Verify subscription hasn't changed since preview was generated
   - Use optimistic locking when updating subscriptions

3. Subscription States:
   - Validate subscription is in valid state for upgrade
   - Check for: canceled, past_due, incomplete states
   - Handle partial period credits correctly

4. Error Recovery:
   - Do not retry usage recording failures - these need manual investigation
   - Log detailed context for failed operations to enable manual fixes:
     - User context (IDs, customer info)
     - Subscription context (old/new IDs, plan changes)
     - Usage context (amounts, billing period dates)
     - Error details (message, type, raw error)
   - Show user-friendly messages that:
     - Acknowledge the error is tracked
     - Provide support contact information
     - Assure users the team will handle it

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
2. Perform quota checks before processing pro operations.
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

## Subscription Previews

When previewing subscription changes:
- Use `stripeServer.invoices.retrieveUpcoming()` to preview changes without modifying the subscription
- Always propagate Stripe error details (code, message, statusCode) to the client
- Handle both API errors (from Stripe) and request errors (from React Query) in the UI
- This provides accurate proration calculations directly from Stripe
- Use `stripeServer.invoices.retrieveUpcoming()` to preview changes without modifying the subscription
- This provides accurate proration calculations directly from Stripe
- Include `subscription_proration_date` to ensure consistent calculations between preview and actual update
- The preview includes credits for unused time and charges for the new plan

## Stripe API Best Practices

### Pagination

- All Stripe list endpoints have a default limit of 100 items
- Always implement pagination when using list endpoints to ensure processing all records
- Use has_more and starting_after parameters to paginate through results
- Example pagination pattern:

  ```typescript
  let hasMore = true
  let lastId = undefined

  while (hasMore) {
    const response = await stripeServer.customers.list({
      limit: 100,
      starting_after: lastId,
    })

    // Process response.data

    hasMore = response.has_more
    if (hasMore) {
      lastId = response.data[response.data.length - 1].id
    }
  }
  ```

## Price Tiers and Migration Handling

Important: Some customers are on legacy or special pricing tiers that require manual handling during migrations:

- $499/mo tier customers require manual migration
- Do not include these customers in automated price update scripts
- Always verify subscription price before automated updates
- When writing migration scripts, add price checks to exclude special tiers

### Plan Name Mapping

When working with plan names:
- Display names (PlanName): 'Free', 'Pro', 'Moar Pro'
- Internal names (UsageLimits): 'FREE', 'PRO', 'MOAR_PRO'
- Always map between them when accessing PLAN_CONFIGS:
  ```typescript
  const config = PLAN_CONFIGS[planName === 'Free' ? 'FREE' : planName === 'Pro' ? 'PRO' : 'MOAR_PRO']
  ```
