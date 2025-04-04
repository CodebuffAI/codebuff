# Unified Credit System Implementation Plan

## 1. Overview

This plan outlines the implementation of a new credit system leveraging Stripe Billing Credits and Meter Events as the primary source of truth for grants and usage history, while utilizing the local database for performant real-time gating decisions and auditing. This approach maintains a monthly usage cycle locally, calculating and carrying forward non-expiring credits via a dedicated 'rollover' grant type.

**Sources of Truth:**

*   **Credit Grants:** Stripe Billing Credits (mirrored locally in `credit_grants` for audit/gating). Locally generated 'rollover' grants are also stored here.
*   **Credit Usage (Monthly):** Local `user.usage` field, reset monthly. This value is used for real-time balance checks within the current cycle.
*   **Credit Usage (Lifetime for Stripe):** Local `message` table `credits` column (synced individually to Stripe Meter Events).
*   **Real-time Balance for Gating:** Calculated locally by simulating the current month's `user.usage` against currently active grants (including the latest 'rollover' grant).
*   **Billing/Invoicing:** Stripe (driven by Meter Events based on `message.credits`).

## 2. Database Schema

*   **Modify `user` table:**
    *   Remove `quota`, `quota_exceeded`, `subscription_active`.
    *   **Keep** `usage` (representing current cycle usage, reset monthly).
    *   **Keep** `next_quota_reset` (to trigger rollover calculation and usage reset).
    *   Keep `stripe_price_id`.
*   **Modify `grant_type` enum:**
    *   Add `'rollover'` to the possible values.
*   **Create `credit_grants` table:** (For auditing grants and local balance calculation, including rollover)
    ```sql
    -- Add 'rollover' to the enum
    CREATE TYPE grant_type AS ENUM ('free', 'referral', 'purchase', 'admin', 'rollover');

    CREATE TABLE credit_grants (
      operation_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      type grant_type NOT NULL,
      description TEXT,
      priority INTEGER NOT NULL, -- Define priorities (e.g., free=25, referral=50, rollover=60, purchase=75, admin=100)
      expires_at TIMESTAMP WITH TIME ZONE, -- Rollover grants will have NULL expires_at
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      stripe_grant_id TEXT UNIQUE -- Rollover grants will have NULL stripe_grant_id
    );

    -- Index definition updated to remove the non-immutable WHERE clause
    CREATE INDEX idx_credit_grants_user_active ON credit_grants(user_id, expires_at, priority, created_at);
    -- Filtering for active grants (expires_at IS NULL OR expires_at > NOW())
    -- must be done in application query logic.
    ```
*   **Create `sync_failures` table:** (For tracking failed Stripe Meter Event syncs - *unchanged*)
    ```sql
    -- Reflects current schema.ts definition
    CREATE TABLE sync_failures (
      message_id TEXT PRIMARY KEY REFERENCES message(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'stripe', -- Added default
      first_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      last_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      retry_count INTEGER NOT NULL DEFAULT 1, -- Added default
      last_error TEXT NOT NULL
    );

    CREATE INDEX idx_sync_failures_retry
    ON sync_failures(retry_count, last_attempt_at)
    WHERE retry_count < 5;
    ```
*   **Keep `message` table:** Continue adding `credits` consumed per message (represents lifetime usage for Stripe sync).

## 3. Stripe Integration (*Largely Unchanged*)

### 3.1. Webhook Handler (`web/src/app/api/stripe/webhook/route.ts`)

*   Listen for `credit_grant.created`, `credit_grant.updated`, `credit_grant.voided`.
*   **`credit_grant.created`:**
    *   Extract grant details (amount, expires\_at, metadata for type/description/priority).
    *   Insert into local `credit_grants` table using `grant.id` as `operation_id` and `stripe_grant_id`. Use `onConflictDoNothing`.
    *   Use metadata to determine `type` and `priority`. Define priorities: `FREE=20`, `REFERRAL=40`, `PURCHASE=80`, `ADMIN=100`. **Do not process 'rollover' type here.**
*   **`credit_grant.updated`:**
    *   Update the corresponding local `credit_grants` record based on `stripe_grant_id`.
*   **`credit_grant.voided`:**
    *   Effectively expire the local grant by setting `expires_at` to `NOW()` based on `stripe_grant_id`.
*   **Important:** Ensure webhook handler is idempotent.

### 3.2. Usage Reporting (`backend/src/usage/service.ts` - hypothetical path)

*   Create `syncMessageToStripe(message: Message)` function.
*   After a message is successfully processed and `credits` are assigned:
    *   Call `syncMessageToStripe`.
    *   Inside `syncMessageToStripe`:
        *   Use `stripeServer.billing.meterEvents.create` to report usage.
            *   `event_name`: e.g., `codebuff_credits_used`
            *   `payload`: Include `stripe_customer_id`, `value` (message.credits), `message_id`.
        *   Implement retry logic.
        *   If retries fail, insert into `sync_failures`.
*   Hook this function into the message completion flow.

### 3.3. Grant Creation (e.g., Referrals) (`web/src/app/api/referrals/helpers.ts`)

*   When granting credits locally (e.g., referral bonus):
    *   Generate a unique `operation_id` (e.g., `local-ref-<uuid>`).
    *   Call `stripeServer.billing.creditGrants.create` with amount, customer ID, description, expiry (if applicable), and metadata including `type`, `priority`, and the generated `operation_id`.
    *   Rely on the webhook (`credit_grant.created`) to insert the grant into the local `credit_grants` table.

## 4. Local Gating & Balance Calculation

### 4.1. Real-time Balance Calculation (`common/src/billing/balance-calculator.ts` - new file)

*   Create `calculateCurrentBalance(userId: string): Promise<CreditBalance>`
    ```typescript
    interface CreditBalance {
      totalRemaining: number;
      breakdown: Record<grant_type, number>; // Remaining credits per type per active grant
      // Potentially add next_expiry_date if needed for UI
    }

    // Define Grant Priorities (example - adjusted for equidistance)
    const GRANT_PRIORITIES: Record<grant_type, number> = {
        free: 20,
        referral: 40,
        rollover: 60, // Consumed after free/referral, before purchase
        purchase: 80,
        admin: 100,
    };
    ```
*   **Implementation:**
    1.  Fetch the user's current monthly usage: `currentCycleUsage = user.usage`.
    2.  Fetch all *currently active* grants for the user from `credit_grants` (where `expires_at IS NULL OR expires_at > NOW()`). This includes the latest 'rollover' grant, current 'free' grant, active 'purchase' grants etc.
    3.  Order these active grants by `priority ASC`, then `created_at ASC`.
    4.  Initialize `remainingBalance = { totalRemaining: 0, breakdown: {} }`.
    5.  Initialize `usageToAccountFor = currentCycleUsage`.
    6.  **Simulate Consumption:** Iterate through the ordered *active* grants:
        *   `consumedFromThisGrant = min(grant.amount, usageToAccountFor)`
        *   `remainingInThisGrant = grant.amount - consumedFromThisGrant`
        *   `usageToAccountFor -= consumedFromThisGrant`
        *   If `remainingInThisGrant > 0`:
            *   `remainingBalance.totalRemaining += remainingInThisGrant`
            *   `remainingBalance.breakdown[grant.type] = (remainingBalance.breakdown[grant.type] || 0) + remainingInThisGrant`
        *   If `usageToAccountFor <= 0`, break the loop.
    7.  Return `remainingBalance`.

### 4.2. Quota Manager Replacement (`common/src/billing/quota-manager.ts`)

*   Remove `AnonymousQuotaManager` and `AuthenticatedQuotaManager`.
*   Create a new `CreditGatingService`.
    ```typescript
    class CreditGatingService {
      // Check if user has enough credits for an estimated cost
      async checkSufficientCredits(userId: string | undefined, fingerprintId: string, estimatedCost: number): Promise<{ sufficient: boolean; remaining: number }> {
        if (!userId) {
          // Handle anonymous users (TBD based on product requirements)
          return { sufficient: true, remaining: Infinity }; // Placeholder
        }

        // Use the new balance calculation logic
        const balance = await calculateCurrentBalance(userId);
        const sufficient = balance.totalRemaining >= estimatedCost;
        return { sufficient, remaining: balance.totalRemaining };
      }

      // Get current balance details for UI display
      async getCurrentBalanceDetails(userId: string): Promise<CreditBalance> {
         if (!userId) {
            // Return zero/default balance for anonymous
            return { totalRemaining: 0, breakdown: { free: 0, referral: 0, purchase: 0, admin: 0, rollover: 0 } };
         }
         // Use the new balance calculation logic
         return calculateCurrentBalance(userId);
      }
    }
    ```
*   **Cost Estimation:** Implement `estimatePromptCost` to provide `estimatedCost`.

### 4.3. Middleware Integration (`backend/src/websockets/middleware.ts`)

*   Update or replace the existing credit check middleware.
*   On actions that consume credits (e.g., `prompt`):
    1.  Estimate the cost (`estimatedCost`).
    2.  Instantiate `CreditGatingService`.
    3.  Call `creditGatingService.checkSufficientCredits(userId, fingerprintId, estimatedCost)`.
    4.  If `!sufficient`, throw an error ('Insufficient credits...'). Include `remaining` balance.
    5.  If `sufficient`, allow the action to proceed (`next()`).

### 4.4. End-of-Cycle Rollover Process (New Logic - Requires Trigger)

*   **Trigger:** This process needs to run reliably for each user when `NOW() >= user.next_quota_reset`. This could be triggered by:
    *   A scheduled job (e.g., daily) checking for users whose reset date has passed.
    *   Lazily triggered during a user's first request after their reset date has passed. (Requires careful handling to avoid race conditions).
*   **Process (`calculateAndApplyRollover(userId, cycleEndDate)`):**
    1.  Fetch the user's usage for the cycle that just ended: `endedCycleUsage = user.usage`.
    2.  Fetch all grants that were active *during* the ended cycle (e.g., `created_at < cycleEndDate` AND (`expires_at IS NULL OR expires_at > cycleStartDate`)). This includes the 'rollover' grant from the *start* of the cycle.
    3.  Order these grants by `priority ASC`, `created_at ASC`.
    4.  Initialize `rolloverAmount = 0`.
    5.  Initialize `usageToAccountFor = endedCycleUsage`.
    6.  **Simulate Cycle Consumption:** Iterate through the ordered grants from the ended cycle:
        *   `consumedFromThisGrant = min(grant.amount, usageToAccountFor)`
        *   `remainingInThisGrant = grant.amount - consumedFromThisGrant`
        *   `usageToAccountFor -= consumedFromThisGrant`
        *   **Check for Rollover Contribution:** If `remainingInThisGrant > 0` AND the grant type is non-expiring (e.g., 'purchase', 'admin', 'rollover'):
            *   `rolloverAmount += remainingInThisGrant`
        *   If `usageToAccountFor <= 0`, break.
    7.  **Database Updates (Transaction Recommended):**
        *   If `rolloverAmount > 0`, insert a new `credit_grants` record:
            *   `type = 'rollover'`
            *   `amount = rolloverAmount`
            *   `priority = 60` // Use the defined priority for rollover
            *   `expires_at = NULL`
            *   `user_id = userId`
            *   `operation_id = 'rollover-<userId>-<timestamp>'`
            *   `description = 'Rollover from previous cycle'`
        *   Update the user:
            *   Set `user.usage = 0`.
            *   Set `user.next_quota_reset` to the next appropriate date (e.g., `cycleEndDate + 1 month`).

## 5. Sync Failure Recovery (`backend/src/jobs/sync-recovery.ts` - new file) (*Unchanged*)

*   Create a background job (e.g., runs every hour).
*   Query `sync_failures` for records with `retry_count < 5`.
*   For each failed message:
    *   Fetch the full `message` record.
    *   Attempt `syncMessageToStripe(message)` again.
    *   If successful, DELETE from `sync_failures`.
    *   If fails again, UPDATE `sync_failures`.
*   Add monitoring/alerting for permanent failures.

## 6. API and UI Updates

*   **`/usage` page (`web/src/app/usage/page.tsx`):**
    *   Fetch balance using `CreditGatingService.getCurrentBalanceDetails`.
    *   Display `totalRemaining` and potentially the `breakdown` (which now includes 'rollover').
    *   Display `user.next_quota_reset` date.
*   **`/api/stripe/subscription/change` (`web/src/app/api/stripe/subscription/change/route.ts`):**
    *   Remove logic related to calculating overages based on the old quota system.
    *   Focus on changing Stripe subscription items. Usage sync handles metered billing.
*   **`/api/referrals` (`web/src/app/api/referrals/route.ts`, `helpers.ts`):**
    *   Ensure `redeemReferralCode` calls the grant creation logic (Section 3.3) using `stripeServer.billing.creditGrants.create`. **Remove direct modification of `user.quota`**.
*   **CLI (`npm-app/src/client.ts`):**
    *   Update credit display/warnings based on WebSocket messages reflecting the new balance structure.
    *   Handle 'Insufficient credits' errors.

## 7. Migration Strategy

1.  **Deploy Schema Changes:** Apply DB migrations: add `'rollover'` to `grant_type` enum, remove `quota`/`quota_exceeded`/`subscription_active` from `user`.
2.  **Backfill Stripe Grants:**
    *   Write a script to fetch all active Stripe Credit Grants for existing customers.
    *   Populate the local `credit_grants` table.
    *   Grant initial 'free' credits via Stripe API for users who should have them (relying on webhook).
3.  **Initial Rollover (Decision Needed):**
    *   **Option A (Complex):** Write a script to calculate the *initial* rollover amount for each user based on their *entire* historical usage (summing `message.credits`) and *all* historical non-expiring grants, then insert the first 'rollover' grant.
    *   **Option B (Simpler):** Skip initial rollover calculation. The first rollover grant will be generated at the end of the *first full cycle* after migration. Users start the first cycle with only their active non-rollover grants. (Recommend this for simplicity).
4.  **Deploy Code:** Deploy webhook handler, `CreditGatingService`, `syncMessageToStripe`, end-of-cycle logic trigger, API/UI updates.
5.  **Enable Usage Sync:** Start calling `syncMessageToStripe` after message completion.
6.  **Switch Gating:** Update the WebSocket middleware to use the new `CreditGatingService.checkSufficientCredits`.
7.  **Monitor:** Closely monitor webhook processing, usage sync, `sync_failures`, end-of-cycle rollover job, gating behavior, and Stripe Meter Events.

## 8. Testing Strategy (*Largely Unchanged*)

*   **Unit Tests:** Test `calculateCurrentBalance`, end-of-cycle rollover logic, `syncMessageToStripe` retry logic.
*   **Integration Tests:** Test webhook processing, usage sync flow, gating middleware, referral flow, end-of-cycle rollover trigger and grant creation.
*   **Manual Tests:** Test UI display, subscription changes, error messages across cycle boundaries.

## 9. Rollback Plan (*Largely Unchanged*)

*   **Short-term:** Disable new middleware, revert API/UI changes. Usage sync can continue. Disable end-of-cycle job.
*   **Long-term:** Revert DB schema changes (requires careful data migration back to old `user.quota` fields if necessary, potentially complex).

## Timeline Estimate (*Roughly similar, maybe slightly longer due to end-of-cycle logic*)

*   Phase 1 (Schema, Webhooks, Basic Balance Calc): 4 days
*   Phase 2 (Usage Sync, Failure Recovery): 3 days
*   Phase 3 (Gating Logic, Middleware, End-of-Cycle Logic): 4 days
*   Phase 4 (API/UI Updates): 4 days
*   Phase 5 (Migration Scripting & Execution - assuming simple initial rollover): 1 day
*   Phase 6 (Testing & Monitoring): 5 days
*   **Total:** ~21 days (~4 weeks)

This revised plan incorporates the 'rollover' grant type and monthly usage cycle.
