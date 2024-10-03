# Billing and Usage Tracking

## Overview

This file contains information about the billing system and usage tracking for the Manicode project.

- The `subscriptionActive` status affects the user's usage limits and access to premium features.

## User Tracking

- The system tracks both authenticated and non-authenticated users.

- Usage tracking is now focused on authenticated users only.
- The `usage` table in the database is the single source of truth for usage data.
- Only authenticated users have entries in the `usage` table.
- Anonymous users have their usage capped at a set amount without being tracked in the database.
- This approach simplifies the system and is considered a good trade-off because:
  1. Logging in is easy for users.
  2. The system only needs to manage usage for users who have actually logged in.
  3. It reduces database complexity and potential issues with merging anonymous and authenticated usage.
- After each backend response to a user, usage is re-calculated and stored in the `usage` table for authenticated users.
- For anonymous users, usage is tracked in-memory and capped at a predefined limit.
- Both authenticated and anonymous users have usage limits.
- Authenticated users' limits are stored in the `usage` table.
- Anonymous users' limits are defined by a constant (e.g., `TOKEN_USAGE_LIMITS.ANON`).

## User Status

- In the database schema, the `subscriptionActive` field (formerly `isActive`) indicates whether a user has an active paid subscription.
- It's important to note that a user can be actively using the system without being a paying customer.
- The system tracks both authenticated and non-authenticated users.
- Non-authenticated users are considered anonymous and their usage is capped to a set amount.
- Authenticated users are tracked using the `user` table and have their usage recorded in the `usage` table.

## Usage Tracking

- Backend checks usage before responding to requests to determine if the response should be provided.
- Both Anthropic and OpenAI provide the total tokens used when generating a response, which we use for accurate tracking.
  - Anthropic outputs input tokens at the beginning of each response, and output tokens at the end.
  - OpenAI outputs the total tokens used at the end of the response.
- Usage is tracked only for authenticated users in the `usage` table.
- Anonymous users have their usage capped to a predefined limit without being recorded in the database.

## Database Schema for Usage Tracking

- The `usage` table is the single source of truth for usage data of authenticated users.
- The `usage` table uses `userId` as the primary key.
- This design allows for efficient tracking of usage for registered users.
- Anonymous users' usage is not persisted in the database but is capped to a set amount.

## Usage Calculation

- After each backend response to an authenticated user, usage is re-calculated and stored in the `usage` table.
- For anonymous users, usage is calculated in-memory and capped to a predefined limit.

## Usage Limits

- Both anonymous and authenticated users have usage limits.
- Anonymous users have a fixed, lower usage limit.
- Authenticated users' limits are stored in the `usage` table and can vary based on their subscription status.

## User Alerts

- Alerts are triggered at 25%, 50%, and 75% of total usage on the current tier. When 100% usage is exceeded, users are notified they can no longer use the service without payment. A link to the pricing page is provided when these thresholds are reached.
- These alerts apply to both anonymous and authenticated users.

## Initial Usage Check

- When the app loads for an authenticated user, a database check is performed to determine approximate credit usage.
- For anonymous users, no initial database check is needed as their usage is not persisted.

## Subscription Handling

- Upon user subscription, the backend is notified to update the user's `pricingPlanId` field and number of credits granted in the `usage` table.
- When a non-authenticated user authenticates, a new usage record is created in the `usage` table.

This updated structure ensures that usage is tracked and limited correctly for both authenticated and anonymous users, addressing the simplified approach of capping anonymous usage and only persisting data for authenticated users.
