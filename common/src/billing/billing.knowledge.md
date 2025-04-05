# Billing System Knowledge

This document outlines key concepts and logic within the Codebuff billing system.

## Core Concepts

- **Credits**: The internal currency used for tracking usage. Users consume credits when interacting with the AI.
- **Grants**: Blocks of credits awarded to users. Grants have types (e.g., `free`, `purchase`, `referral`, `rollover`), amounts, priorities, and optional expiration dates.
- **Balance**: A user's available credits, calculated by summing active, non-expired grants according to priority.
- **Rollover**: Unused paid credits from one cycle can roll over to the next, subject to limits.
- **Stripe Integration**: Stripe is used for processing payments, managing subscriptions, and issuing monetary credit grants using the Billing Credits API (v18+).

## Credit Conversion (`common/src/billing/conversion.ts`)

- **Stripe to Internal**: Stripe credit grant amounts are typically provided in the smallest currency unit (e.g., cents for USD).
    - **Function**: `convertStripeGrantAmountToCredits(amountInCents)` converts cents to internal credits.
    - **Ratio**: Currently 1 cent = 1 internal credit.
    - **Usage**: Used in the Stripe webhook handler (`handleCreditGrantCreated`) when receiving grant amounts from Stripe to store the correct internal credit value in the `creditGrants` table.
- **Internal to Stripe**: When creating grants via the Stripe API, internal credit amounts must be converted to the monetary format Stripe expects.
    - **Function**: `convertCreditsToUsdCents(credits)` converts internal credits to USD cents (using `Math.ceil`).
    - **Function**: `createStripeMonetaryAmount(credits)` uses the above to generate the `{ monetary: { currency: 'usd', value: cents }, type: 'monetary' }` object required by `stripe.billing.creditGrants.create`.
    - **Ratio**: Currently 1 internal credit = 1 cent.
    - **Usage**: Used when creating initial free grants (`auth-options.ts`) and referral bonus grants (`referrals/helpers.ts`) via the Stripe API.

## Balance Calculation (`balance-calculator.ts`)

- `calculateCurrentBalance`: The primary function to determine a user's available credits.
- **Logic**:
    1. Fetches all non-expired grants for the user from the database.
    2. Groups grants by type.
    3. Calculates the total amount for each grant type.
    4. Calculates total usage for the current billing cycle.
    5. Determines the remaining balance for each grant type by applying usage based on `GRANT_PRIORITIES`.
    6. Returns the total remaining balance and a breakdown by grant type.
- **Priorities (`GRANT_PRIORITIES`)**: Defines the order in which different grant types are consumed (e.g., free credits used before purchased credits).

## Quota Management (`quota-manager.ts`)

- `CreditGatingService`: Checks if a user has sufficient credits *before* an action is performed.
- `checkSufficientCredits`:
    1. Calculates the user's current balance using `calculateCurrentBalance`.
    2. Compares the balance against the estimated cost of the requested action.
    3. Returns whether the user has sufficient credits and their remaining balance.
- **Usage Tracking**: Actual usage is recorded *after* an action completes (e.g., in `message-cost-tracker.ts` for AI messages) by incrementing the `usage` column on the `user` table for the current cycle.

## Rollover Logic (`rollover-logic.ts`)

- `calculateAndApplyRollover`: Calculates rollover credits at the end of a billing cycle.
- **Logic**:
    1. Determines unused purchased credits from the previous cycle.
    2. Calculates the maximum allowable rollover amount (typically a percentage or cap based on the user's plan).
    3. Creates a new `rollover` grant for the user with the calculated amount (up to the limit).
- **Trigger**: This logic should ideally be triggered by a scheduled job or webhook when a Stripe subscription renews or a billing cycle ends.

## Stripe Webhooks (`web/src/app/api/stripe/webhook/route.ts`)

- Handles events from Stripe, such as `billing.credit_grant.created` and `billing.credit_grant.updated`.
- **`handleCreditGrantCreated`**:
    - Receives grant details from Stripe (amount is in cents).
    - Uses `convertStripeGrantAmountToCredits` to determine the internal credit amount.
    - Inserts a corresponding record into the `creditGrants` table in the local database.
    - Uses `grant.metadata.user_id` to link the grant to the user, avoiding an extra DB query.
- **`handleCreditGrantUpdated`**:
    - Updates grant details (like `expires_at` or `description`) in the local database based on Stripe changes. (Currently does not update amount).

## Key Tables (`common/db/schema.ts`)

- **`user`**: Stores user information, including `stripe_customer_id` and current cycle `usage`.
- **`creditGrants`**: Stores records of all credit grants awarded to users, linked via `user_id`. Includes `amount`, `type`, `priority`, `expires_at`, `stripe_grant_id`, etc.
- **`referral`**: Tracks referral relationships and statuses.
- **`syncFailures`**: Logs failures when syncing usage to Stripe Meter Events.

## Important Considerations

- **Consistency**: Ensure grant amounts and types are consistent between Stripe metadata and the local `creditGrants` table.
- **Atomicity**: Use database transactions when multiple related records need to be updated (e.g., during rollover or referral redemption).
- **Error Handling**: Implement robust error handling, especially for Stripe API calls and webhook processing. Log failures (e.g., to `syncFailures`) for later reconciliation.
- **Testing**: Thoroughly test balance calculations, rollover logic, and webhook handlers with various scenarios (different grant types, priorities, expirations).

## Testing Guidelines

- **Unit Tests**: Test individual functions and modules in isolation.
- **Integration Tests**: Verify that components work together as expected.
- **End-to-End Tests**: Simulate real-world scenarios to ensure all systems interact correctly.
- **Performance Tests**: Measure system performance under load and ensure it remains stable.
- **Regression Tests**: Regularly run tests after making changes to ensure no new bugs are introduced.
