# Billing and Usage Tracking

## Overview

This file contains information about the billing system and usage tracking for the Manicode project.

## User Tracking

- The system tracks both authenticated and non-authenticated users.
- Non-authenticated users are initially tracked using a `fingerprints` table.
- Authenticated users are tracked using the `user` table.

## Usage Tracking

- Backend checks usage before responding to requests to determine if the response should be provided.
- Both Anthropic and OpenAI provide the total tokens used when generating a response, which we use for accurate tracking.
  - Anthropic outputs input tokens at the beginning of each response, and output tokens at the end.
  - OpenAI outputs the total tokens used at the end of the response.
- Usage is tracked using a combined approach:
  - The system queries both the `fingerprints` and `user` tables.
  - Token usage is combined from both tables to get the total usage.
  - The higher limit between the two tables is used as the effective limit.

## Usage Calculation

- After each backend response to a user, usage is re-calculated and stored in the appropriate table(s).
- For users transitioning from non-authenticated to authenticated status, both fingerprint and user data are considered.
- A new `usage` action is sent to the client after each usage calculation.

## Usage Limits

- Both fingerprint and user records have a `limit` field that sets the token usage limit.
- When checking limits, the system uses the higher limit between the fingerprint and user records.
- The default limit should be set appropriately in both tables.
- The `checkUsageLimit` method in the `UsageTracker` class enforces these limits, considering both fingerprint and user data.

## User Alerts (npm-app)

- Alerts are triggered at 25%, 50%, and 75% of total usage on the current tier. When 100% usage is exceeded, users are notified they can no longer use the service without payment. A link to the pricing page is provided when these thresholds are reached.
- These alerts apply to both authenticated and non-authenticated users.

## Initial Usage Check

- When the app loads, a database check is performed to determine approximate credit usage, using both the `user` and `fingerprints` tables as appropriate.
- This feature can be easily enabled/disabled using an environment variable or feature flag.

## Subscription Handling

- Upon user subscription, the backend is notified to update the user's `pricingPlanId` field and number of credits granted in the database.
- When a non-authenticated user authenticates, their usage data should be considered alongside their new user account data.

## Implementation Notes

- Use the token count provided by Anthropic and OpenAI APIs for accurate usage tracking.
- Implement a join query that combines data from both `fingerprints` and `user` tables.
- Update the appropriate row(s) in the database after each API request to reflect the latest usage.
- Implement usage checking before processing requests, considering both fingerprint and user data.
- Ensure proper error handling and user notification in the npm-app for usage limits.
- Consider caching strategies for user/fingerprint tier information to optimize performance.
- Implement a robust system for tracking and updating usage across multiple requests, considering both authenticated and non-authenticated states.
- Ensure the pricing page link is easily accessible when usage limits are reached.
- Add a `usage` action type to the WebSocket message schema.
- Implement a mechanism to prevent showing the same usage alert multiple times, only updating when a new threshold is crossed.
- Implement atomic updates for token usage to prevent race conditions and ensure accurate tracking.
- Use efficient querying methods when retrieving records to optimize database operations.
- Track input tokens from Claude at the beginning of each message (message type `message_start`) using the `usageTracker.trackTokens` function.

## Usage Tracking Logic

The `UsageTracker` class implements the following logic:

1. Query both `user` and `fingerprints` tables:

   - Join the tables based on the fingerprintId and userId.
   - Combine the usage from both tables.
   - Use the higher limit between the two tables.

2. When tracking tokens:

   - Update the `usage` in both tables as appropriate.

3. When checking usage limits:

   - Compare the combined `usage` against the higher `limit` from both tables.

4. When a user authenticates:
   - Maintain the fingerprint record but associate it with the user.
   - Consider both records for future usage tracking and limit checking.

This updated structure ensures that usage is tracked and limited correctly for both authenticated and non-authenticated users, addressing the issue of users potentially exceeding limits when using multiple devices or transitioning between authenticated states.

## Atomic Updates

When updating the `usage` field, it's crucial to use atomic operations to prevent race conditions and ensure accurate tracking. This is particularly important in a system where multiple requests might be updating the usage simultaneously.

Example of an atomic update in SQL:

```sql
UPDATE table_name
SET tokenUsage = tokenUsage + :new_tokens
WHERE id = :id
```

## Efficient Querying

When retrieving records, use efficient querying methods to optimize database operations. For example, use joins and subqueries effectively to minimize the number of database calls:

```typescript
const result = await db
  .select({
    combinedUsage: sql`COALESCE(f.tokenUsage, 0) + COALESCE(u.tokenUsage, 0)`,
    effectiveLimit: sql`GREATEST(COALESCE(f.limit, 0), COALESCE(u.limit, 0))`,
  })
  .from(schema.fingerprint.as('f'))
  .leftJoin(schema.user.as('u'), eq(schema.fingerprint.userId, schema.user.id))
  .where(eq(schema.fingerprint.id, fingerprintId))
  .limit(1)
```

This approach reduces the amount of data transferred and processed, potentially improving performance, especially as the database grows.
