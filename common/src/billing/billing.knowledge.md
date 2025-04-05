# Billing System Knowledge

This document outlines key concepts and logic within the Codebuff billing system.

## Core Concepts

- **Internal Credits**: An abstract unit used internally for tracking usage and gating access. The monetary value of one internal credit can vary per user (e.g., based on their plan).
- **Monetary Value (Cents)**: The actual cost tracked and billed by Stripe, typically in USD cents.
- **Grants**: Blocks of *internal credits* awarded to users. Grants have types (e.g., `free`, `purchase`, `referral`, `rollover`), amounts (in internal credits), priorities, and optional expiration dates. These are stored locally in the `creditGrants` table.
- **Stripe Credit Grants**: Represent monetary value granted via Stripe's Billing Credits API. These are linked to local grants but store monetary amounts.
- **Balance**: A user's available *internal credits*, calculated by summing active, non-expired local grants according to priority and deducting usage.
- **Usage**: Tracked locally in the `user.usage` column as *internal credits* consumed during the current billing cycle.
- **Stripe Meter Events**: Used to report *monetary usage* (in cents) to Stripe for billing purposes. The meter event payload contains the cost in cents.
- **Rollover**: Unused *internal credits* derived from specific grant types (like 'purchase') from one cycle can roll over to the next, resulting in a new 'rollover' grant.
- **Stripe Integration**: Stripe is used for processing payments, managing subscriptions, and issuing *monetary* credit grants.

## Credit/Monetary Conversion (`common/src/billing/conversion.ts`)

- **User Cost Per Credit**:
    - **Function**: `getUserCostPerCredit(userId)` determines the cost of one *internal credit* in cents for a specific user.
- **Stripe Grant (Cents) to Internal Credits**:
    - **Function**: `convertStripeGrantAmountToCredits(amountInCents, centsPerCredit)` converts the monetary value from a Stripe grant webhook into internal credits based on the user's rate.
    - **Usage**: Used in the Stripe webhook handler (`handleCreditGrantCreated`) to store the correct *internal credit* amount in the local `creditGrants` table.
- **Internal Credits to Monetary Cents**:
    - **Function**: `convertCreditsToUsdCents(credits, centsPerCredit)` converts internal credits to USD cents based on the user's rate.
- **Internal Credits to Stripe Monetary Amount Object**:
    - **Function**: `createStripeMonetaryAmount(credits, centsPerCredit)` uses the above to generate the `{ monetary: { currency: 'usd', value: cents }, type: 'monetary' }` object required by `stripe.billing.creditGrants.create`.
    - **Usage**: Used when creating initial free grants (`auth-options.ts`) and referral bonus grants (`referrals/helpers.ts`) via the Stripe API, ensuring the correct *monetary value* is granted based on the intended internal credit bonus and the user's rate.

## Usage Calculation & Reporting (`backend/src/llm-apis/message-cost-tracker.ts`)

- **`saveMessage` Logic**:
    1. Calculates the raw monetary cost (USD) of an LLM call (`calcCost`).
    2. Calculates the final monetary cost in cents, including profit margin (`monetaryCostInCents`).
    3. Fetches the user's cost per credit (`getUserCostPerCredit`).
    4. Calculates the *internal credits* consumed (`internalCreditsUsed = ceil(monetaryCostInCents / centsPerCredit)`).
    5. Stores the message record with `cost` (raw USD) and `credits` (internal credits used).
    6. Updates `user.usage` by adding `internalCreditsUsed`.
    7. Sends the `internalCreditsUsed` value to the client in the `message-cost-response`.
    8. Calls `syncMessageToStripe` to report the `monetaryCostInCents` to the Stripe Meter Event.

## Balance Calculation (`balance-calculator.ts`)

- `calculateCurrentBalance`: Calculates the user's available *internal credits*.
- **Logic**:
    1. Fetches the user's current cycle usage (in *internal credits*) from `user.usage`.
    2. Fetches all active, non-expired *local* grants (amounts are in *internal credits*) for the user from `creditGrants`.
    3. Orders grants by `GRANT_PRIORITIES`.
    4. Simulates consumption: Deducts `user.usage` from the grants according to priority.
    5. Sums the remaining amounts in each grant to get the total remaining *internal credits* and a breakdown by type.
- **Priorities (`GRANT_PRIORITIES`)**: Defines the order in which different grant types (representing internal credits) are consumed.

## Credit Gating (`backend/src/websockets/middleware.ts`)

- **Logic**:
    1. Before processing an action (like 'prompt'), calculates the user's current *internal credit* balance using `calculateCurrentBalance`.
    2. Checks if `totalRemaining > 0`.
    3. If balance is zero or less, rejects the action.

## Rollover Logic (`rollover-logic.ts`)

- `calculateAndApplyRollover`: Calculates rollover *internal credits* at the end of a billing cycle.
- **Logic**:
    1. Simulates consumption of *internal credits* using grants active during the ended cycle and the cycle's final `user.usage`.
    2. Sums the remaining *internal credits* from eligible grant types (e.g., 'purchase', 'rollover').
    3. Creates a new local `rollover` grant in the `creditGrants` table with the calculated *internal credit* amount.
    4. Resets `user.usage` to 0 and updates `next_quota_reset`.

## Stripe Webhooks (`web/src/app/api/stripe/webhook/route.ts`)

- Handles events from Stripe.
- **`handleCreditGrantCreated`**:
    - Receives grant details from Stripe (amount is monetary, in cents).
    - Fetches the user's cost per credit (`getUserCostPerCredit`).
    - Uses `convertStripeGrantAmountToCredits` to determine the equivalent *internal credit* amount.
    - Inserts a corresponding record into the local `creditGrants` table with the calculated *internal credit* amount.
    - Uses `grant.metadata.user_id` to link the grant.
- **`handleCreditGrantUpdated`**: Updates local grant details like `expires_at`.

## Key Tables (`common/db/schema.ts`)

- **`user`**: Stores `stripe_customer_id` and current cycle `usage` (in *internal credits*).
- **`creditGrants`**: Stores records of all credit grants, linked via `user_id`. `amount` is in *internal credits*. Includes `type`, `priority`, `expires_at`, `stripe_grant_id`.
- **`message`**: Stores details of each LLM interaction. `cost` is raw USD cost, `credits` is *internal credits* consumed.
- **`referral`**: Tracks referrals. `credits` field stores the bonus amount in *internal credits*.
- **`syncFailures`**: Logs failures when syncing *monetary usage* to Stripe Meter Events.

## Important Considerations

- **Stripe Meter Configuration**: The Stripe Meter (e.g., named 'credits' or 'usage_cents') **must** be configured in the Stripe dashboard to track **monetary value (USD cents)**, not abstract units.
- **Consistency**: Ensure grant types and priorities are consistent between Stripe metadata and the local `creditGrants` table. `user_id` must be in Stripe grant metadata.
- **Atomicity**: Use database transactions for operations involving multiple related updates (rollover, referral redemption).
- **Error Handling**: Robust error handling for Stripe API calls, webhook processing, and conversions. Log failures.
- **Testing**: Test balance calculations, usage reporting, grant creation/conversion, rollover, and webhooks thoroughly.
