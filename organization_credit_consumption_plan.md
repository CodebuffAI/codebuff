
# Plan: Implement Organization-Based Credit Consumption

This plan outlines the steps to implement a feature where credit consumption for approved repositories is charged to the user's organization.

## 1. Define Organization Grant Type

*   **File:** `common/src/db/schema.ts`
    *   Add `'organization'` to the `grantTypeEnum`.
    *   Ensure `GrantType` type is updated.
*   **File:** `common/src/constants/grant-priorities.ts`
    *   Add the new organization grant type to `GRANT_PRIORITIES` with an appropriate priority level (e.g., similar to or slightly higher than 'purchase').

    ```typescript
    // common/src/db/schema.ts
    // ... existing code ...
    export const grantTypeEnum = pgEnum('grant_type', [
      GrantTypeValues[0],
      ...GrantTypeValues.slice(1),
      'organization', // Add new type
    ]);
    // ... existing code ...

    // common/src/constants/grant-priorities.ts
    // ... existing code ...
    export const GRANT_PRIORITIES: Record<GrantType, number> = {
      // ... existing priorities ...
      organization: 70, // between admin and purchase priorities
    };
    // ... existing code ...
    ```

## 2. Implement Organization Credit Granting Logic

*   **File:** `packages/billing/src/grant-credits.ts`
    *   Review `grantCreditOperation` and `processAndGrantCredit`:
        *   Confirm they can handle `org_id` being passed and stored in `creditLedger`. The schema already supports this.
    *   Implement/Verify `grantOrganizationCredits(orgId: string, purchasingUserId: string, amount: number, operationId: string, description: string)`:
        *   This function will be called, for example, by `web/src/app/api/orgs/[orgId]/credits/route.ts`.
        *   It should call `processAndGrantCredit` (or `grantCreditOperation` if within a transaction).
        *   Crucially, it must populate the `org_id` field in the `creditLedger` entry.
        *   The `user_id` field in `creditLedger` for an organization grant could be null, or it could represent the admin/owner who initiated the credit purchase. The current schema for `creditLedger` has `user_id` as `NOT NULL` if it's not an org grant, and `org_id` as nullable. We might need to adjust this or decide that `user_id` for an org grant refers to the purchasing user. For now, let's assume `user_id` can be the purchasing user and `org_id` is set.

    ```typescript
    // packages/billing/src/grant-credits.ts
    // ... (ensure grantCreditOperation can take org_id) ...

    export async function grantOrganizationCredits(
      orgId: string,
      purchasingUserId: string, // User making the purchase
      amount: number,
      operationId: string,
      description: string
    ): Promise<void> {
      // For organization grants, expiresAt is typically null (non-expiring)
      // unless specific business logic dictates otherwise.
      const expiresAt = null;
      // The 'type' should be the new organization grant type
      const type: GrantType = 'organization';

      // processAndGrantCredit already handles idempotency and retries.
      // We need to ensure it can pass org_id to grantCreditOperation.
      // For now, assuming grantCreditOperation is modified to accept org_id:
      await grantCreditOperation(
        purchasingUserId, // Or null if user_id is not for the purchaser in org grants
        amount,
        type,
        description,
        expiresAt,
        operationId,
        undefined, // tx
        orgId // Pass the orgId here
      );
      logger.info(
        { orgId, purchasingUserId, amount, operationId },
        'Granted credits to organization'
      );
    }
    ```
    *Note: `grantCreditOperation` will need a signature update to accept `orgId?: string`.*

## 3. Implement Organization Credit Balance and Usage Calculation

*   **File:** `packages/billing/src/balance-calculator.ts`
    *   Create `getOrderedActiveOrgGrants(orgId: string, now: Date, conn: DbConn = db)`:
        *   Similar to `getOrderedActiveGrants(userId, now, conn)`.
        *   Filters `creditLedger` by `eq(schema.creditLedger.org_id, orgId)`.
        *   Order by priority, expiration, creation date.
    *   Implement `calculateOrganizationUsageAndBalance(orgId: string, cycleStartDate: Date, now: Date = new Date(), conn: DbConn = db)`:
        *   This function is already referenced in `web/src/app/api/orgs/[orgId]/usage/route.ts`.
        *   It should mirror `calculateUsageAndBalance` but use `getOrderedActiveOrgGrants`.
        *   The `CreditBalance` and `CreditUsageAndBalance` interfaces should be reusable.

    ```typescript
    // packages/billing/src/balance-calculator.ts

    export async function getOrderedActiveOrgGrants(
      orgId: string,
      now: Date,
      conn: DbConn = db
    ) {
      return conn
        .select()
        .from(schema.creditLedger)
        .where(
          and(
            eq(schema.creditLedger.org_id, orgId), // Filter by org_id
            or(
              isNull(schema.creditLedger.expires_at),
              gt(schema.creditLedger.expires_at, now)
            )
          )
        )
        .orderBy(
          asc(schema.creditLedger.priority),
          asc(schema.creditLedger.expires_at),
          asc(schema.creditLedger.created_at)
        );
    }

    export async function calculateOrganizationUsageAndBalance(
      orgId: string,
      quotaResetDate: Date, // This is cycleStartDate for orgs
      now: Date = new Date(),
      conn: DbConn = db
    ): Promise<CreditUsageAndBalance> {
      const grants = await getOrderedActiveOrgGrants(orgId, now, conn);
      // ... rest of the logic similar to calculateUsageAndBalance ...
      // Ensure usageThisCycle calculation is based on org's cycle and grants.
      // The CreditBalance structure (totalRemaining, breakdown, etc.) will be for the org.
      // For example:
      let usageThisCycle = 0;
      const balance: CreditBalance = { /* ... initial ... */ };

      for (const grant of grants) {
        // Usage calculation for orgs might be simpler if they don't have "quota resets"
        // but rather continuous consumption from a pool.
        // If cycleStartDate is relevant (e.g. for reporting "usage this month"):
        if (grant.created_at > quotaResetDate || !grant.expires_at || grant.expires_at > quotaResetDate) {
            usageThisCycle += grant.principal - grant.balance;
        }
        // ... populate balance object ...
      }
      // ... settlement logic if needed ...
      logger.debug({ orgId, balance, usageThisCycle }, 'Calculated org usage and balance');
      return { usageThisCycle, balance };
    }
    ```

## 4. Implement Organization Credit Consumption Logic

*   **File:** `packages/billing/src/balance-calculator.ts`
    *   Create `consumeOrganizationCredits(orgId: string, creditsToConsume: number): Promise<CreditConsumptionResult>`:
        *   Analogous to `consumeCredits(userId, creditsToConsume)`.
        *   Use `withSerializableTransaction`.
        *   Fetch grants using `getOrderedActiveOrgGrants(orgId, now, tx)`.
        *   Adapt or reuse `consumeFromOrderedGrants` logic. The `userId` parameter in `consumeFromOrderedGrants` and `updateGrantBalance` might need to become optional or be handled differently (e.g., pass `orgId` instead/as well). For logging purposes, it might be good to know which user *triggered* the consumption against the org's balance.

    ```typescript
    // packages/billing/src/balance-calculator.ts

    // May need to adapt updateGrantBalance and consumeFromOrderedGrants
    // to accept orgId and an optional triggeringUserId for logging.
    // For example, updateGrantBalance(grant, consumed, newBalance, tx, { orgId, triggeringUserId })

    export async function consumeOrganizationCredits(
      orgId: string,
      creditsToConsume: number,
      triggeringUserId?: string // Optional: for logging who caused the consumption
    ): Promise<CreditConsumptionResult> {
      return await withSerializableTransaction(
        async (tx) => {
          const now = new Date();
          const activeGrants = await getOrderedActiveOrgGrants(orgId, now, tx);

          if (activeGrants.length === 0) {
            logger.error(
              { orgId, creditsToConsume, triggeringUserId },
              'No active organization grants found to consume credits from'
            );
            // Potentially create a debt grant for the organization here if desired,
            // or throw an error. For now, let's assume throwing is appropriate.
            throw new Error('No active organization grants found');
          }

          // consumeFromOrderedGrants might need an adaptation for orgs,
          // particularly how 'userId' is handled for logging or debt creation.
          // Let's assume a conceptual orgConsumeFromOrderedGrants or an adapted one.
          const result = await consumeFromOrderedGrants(
            orgId, // Pass orgId as the "identifier"
            creditsToConsume,
            activeGrants,
            tx
            // Potentially pass triggeringUserId for logging within consumeFromOrderedGrants
          );
          logger.info({ orgId, consumed: result.consumed, fromPurchased: result.fromPurchased, triggeringUserId }, "Consumed credits from organization account");
          return result;
        },
        { orgId, creditsToConsume, triggeringUserId }
      );
    }
    ```

## 5. Integrate into Usage Tracking

*   **File:** `backend/src/llm-apis/message-cost-tracker.ts` (primarily `saveMessage` function)
    *   When a message's cost is determined:
        1.  Get `userId` and `repoUrl` from the message context.
        2.  If `repoUrl` is present:
            *   Fetch the user's organization memberships (e.g., from `orgMember` table).
            *   For each organization the user belongs to, call a backend version of `checkRepositoryAccess(orgId, repoUrl)`.
                *   `checkRepositoryAccess` (currently in `web/src/lib/organization-permissions.ts`) needs to be accessible by the backend. This might mean moving it to `common` or creating a backend-specific utility.
            *   If an approved org repo is found, this `orgId` should be used. Prioritize if user is in multiple orgs with same approved repo (e.g., first one found, or based on some org setting).
        3.  If an `orgId` is determined for the usage:
            *   Populate `message.org_id = orgId` before inserting into the `message` table.
            *   In the credit consumption step (currently calls `consumeCredits(userId, ...)`):
                *   If `orgId` is set on the message, call `consumeOrganizationCredits(orgId, creditsCost, userId)`.
                *   Else, call `consumeCredits(userId, creditsCost)`.

    ```typescript
    // backend/src/llm-apis/message-cost-tracker.ts
    // Inside saveMessage or a similar function after cost calculation:

    // ... (cost calculation) ...
    const { costInCredits, ... } = calculateCost( ... );
    let orgIdForConsumption: string | undefined = undefined;

    if (repoUrl && userId) {
      // Pseudocode for finding orgId:
      // 1. Get user's orgs: const userOrgs = await db.query.orgMember.findMany({ where: eq(schema.orgMember.user_id, userId) });
      // 2. For each org:
      //    const backendCheckRepoAccess = requireCommonModule('organization-permissions').checkRepositoryAccess; // Or similar
      //    const access = await backendCheckRepoAccess(org.org_id, repoUrl);
      //    if (access.approved) {
      //      orgIdForConsumption = org.org_id;
      //      break; // Found an org that approves this repo
      //    }
    }

    // Store org_id with the message if applicable
    // await db.insert(schema.message).values({ ..., org_id: orgIdForConsumption, ... });

    if (orgIdForConsumption) {
      await consumeOrganizationCredits(orgIdForConsumption, costInCredits, userId);
    } else if (userId) { // Fallback to personal credits if no org or not an approved repo
      await consumeCredits(userId, costInCredits);
    } else {
      // Handle case where usage cannot be attributed (e.g. anonymous, though unlikely for costly ops)
      logger.error({ costInCredits, repoUrl }, "Could not attribute credit consumption to user or org");
    }
    ```

## 6. Update API Endpoints and Frontend

*   **API Endpoints (e.g., `web/src/app/api/orgs/[orgId]/usage/route.ts`):**
    *   Ensure it calls `calculateOrganizationUsageAndBalance` and `syncOrganizationBillingCycle` (if the latter is also org-specific).
    *   The `topUsers` and `recentUsage` queries within this endpoint should correctly sum usage from messages linked to the `orgId`.
*   **Frontend (e.g., `web/src/app/usage/usage-display.tsx`):**
    *   This component already has an `'organization'` entry in `grantTypeInfo`.
    *   Ensure that when displaying an organization's balance, the data comes from `calculateOrganizationUsageAndBalance`.
    *   When a user views their *personal* usage, it should *not* include usage that was billed to an organization. The `calculateUsageAndBalance` for users should ideally exclude messages that have an `org_id` set.

## 7. Address TypeScript Errors

*   The `bun tsc -b -w --preserveWatchOutput` shows many errors. As the functions and types above are implemented, these should be resolved.
*   **`common/types/organization`:** This module needs to be created or its path fixed. It should contain types like `OrganizationRole`, `OrganizationUsageResponse`, etc.
    ```typescript
    // common/src/types/organization.ts (New file or ensure it exists)
    export type OrganizationRole = 'owner' | 'admin' | 'member';

    export interface OrganizationUsageResponse {
      currentBalance: number;
      usageThisCycle: number;
      cycleStartDate: string;
      cycleEndDate: string;
      topUsers: Array<{ /* ... fields ... */ }>;
      recentUsage: Array<{ /* ... fields ... */ }>;
    }
    // ... other org-related types ...
    ```
*   **`CREDIT_PRICING`:** This constant needs to be defined and exported from `common/src/constants.ts` or a similar central location.
    ```typescript
    // common/src/constants.ts
    export const CREDIT_PRICING = {
        CENTS_PER_CREDIT: 1, // Example: 1 cent per credit
        DISPLAY_RATE: "$0.01 per credit" // Example
    };
    ```
*   **Missing Billing Functions:** Implementing `calculateOrganizationUsageAndBalance`, `grantOrganizationCredits`, `syncOrganizationBillingCycle` (if org-specific version needed) in `@codebuff/billing` (i.e., `packages/billing/src/`) and exporting them correctly will fix these.
*   **`validateAndNormalizeRepositoryUrl`:** This function, if needed, should also be implemented in the billing or a common utility package.

## 8. Testing Strategy

*   **Unit Tests:**
    *   For each new/modified billing function in `packages/billing/src/`.
    *   Test `getOrderedActiveOrgGrants`.
    *   Test `calculateOrganizationUsageAndBalance` with various grant scenarios.
    *   Test `consumeOrganizationCredits` (success, insufficient funds, debt creation if applicable).
    *   Test `grantOrganizationCredits`.
*   **Integration Tests:**
    *   Test the `message-cost-tracker.ts` logic:
        *   Message from user, non-org repo -> personal credits consumed.
        *   Message from user in org, non-approved repo -> personal credits consumed.
        *   Message from user in org, approved repo -> org credits consumed.
    *   Test API endpoints for org credit purchase and usage viewing.
*   **End-to-End Tests (Manual or Automated):**
    *   Simulate an admin purchasing credits for an org.
    *   Simulate a member using an approved repo and verify org balance decreases.
    *   Simulate a member using a personal repo and verify personal balance decreases.
    *   Check display of balances on both user and org dashboards.
