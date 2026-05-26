# Feature Flags

This system allows you to toggle features on/off without redeploying the application.

## How It Works

Feature flags can be controlled via:

1. **Database** (primary) - Set via mutations in the Convex dashboard or admin UI
2. **Environment Variables** (fallback) - Set `FEATURE_<FLAG_NAME>=true` in `.env`

## Available Feature Flags

### `billing_enforcement`

Controls whether billing checks and feature access restrictions are enforced throughout the application.

**When Enabled:**

- Credit usage tracking and deductions are enforced for coding agent, emails, AI integrations
- Boolean feature paywalls are enforced (see Boolean Feature Paywalls section below)
- Free users are blocked from premium features (GitHub Integration, Custom Domains, etc.)
- Backend mutations/actions validate feature access before executing
- UI components hide premium features for users without access

**When Disabled:**

- No billing checks - all users can use all features
- No credit requirements or tracking
- All boolean features are accessible regardless of plan
- Useful for testing, development, or emergency kill switch

## Managing Feature Flags

### Via Convex Dashboard

1. Go to Functions in Convex dashboard
2. Run `setFlag` mutation with:
   ```json
   {
     "key": "billing_enforcement",
     "enabled": true,
     "description": "Enable billing enforcement for coding agent"
   }
   ```

### Via Environment Variable

Add to `.env.local`:

```bash
FEATURE_BILLING_ENFORCEMENT=true
```

### Via Code (Admin Only)

```typescript
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";

const setFlag = useMutation(api.featureFlags.setFlag);

// Enable billing
await setFlag({
  key: "billing_enforcement",
  enabled: true,
  description: "Turning on billing for all users",
});

// Disable billing (kill switch)
await setFlag({
  key: "billing_enforcement",
  enabled: false,
  description: "Emergency: Disabling billing due to issues",
});
```

## Checking Feature Flags

### Backend (Convex)

```typescript
import { internal } from "./_generated/api";

// In an action
const billingEnabled = await ctx.runQuery(internal.featureFlags.isEnabled, {
  key: "billing_enforcement",
});

if (billingEnabled) {
  // Check credits and enforce billing
}
```

### Frontend (React)

```typescript
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function MyComponent() {
  const featureFlag = useQuery(api.featureFlags.checkFeature, {
    key: "billing_enforcement",
  });

  const isEnabled = featureFlag?.enabled ?? false;

  // Render UI based on flag
}
```

## Deployment Strategy

1. **Initial Deploy**: Deploy with feature flag **disabled** (default)
2. **Test in Production**: Verify everything works without the feature
3. **Enable for Testing**: Enable flag in database for your test account
4. **Gradual Rollout**: Enable for all users once confident
5. **Kill Switch**: If issues arise, immediately set flag to `false` in database

## Security

- Only users with `role: "god"` can modify feature flags
- Unauthorized attempts throw an error
- Feature flags are cached per query for performance

## Boolean Feature Paywalls

The `billing_enforcement` feature flag controls access to premium features based on user's subscription plan (defined in `autumn.config.ts`).

### Implemented Paywalled Features

| Feature                | Feature ID             | Required Plan | Backend Enforcement                | UI Gating                  |
| ---------------------- | ---------------------- | ------------- | ---------------------------------- | -------------------------- |
| **GitHub Integration** | `github_integration`   | Hobby+        | ✅ repositories.ts, connections.ts | ✅ GitHubSyncAccordion.tsx |
| **Custom Domains**     | `custom_domains`       | Hobby+        | ✅ domains.ts                      | ✅ DomainManager.tsx       |
| **In-app Support**     | `in_app_support`       | Hobby+        | ✅ tickets.ts                      | ✅ AppAndSupportView.tsx   |
| Remove vly.ai Branding | `no_vlyai_branding`    | Hobby+        | 🔄 Deploy-time check               | 🔄 To be added on deploy   |
| Abstraction Documents  | `abstraction_document` | Hobby+        | ⏸️ Deferred (complex)              | ⏸️ Deferred (complex)      |
| Convex Logs            | `convex_logs`          | Free+         | ⏸️ Not needed (in Free)            | ⏸️ Not needed (in Free)    |
| Convex Database        | `convex_database`      | Free+         | ⏸️ Not needed (in Free)            | ⏸️ Not needed (in Free)    |
| Project Code Editor    | `project_code_editor`  | Free+         | ⏸️ Not needed (in Free)            | ⏸️ Not needed (in Free)    |

### Implementation Architecture

**Backend Enforcement (`convex/lib/featureAccessControl.ts`):**

```typescript
import {
  requireFeatureAccess,
  BOOLEAN_FEATURE_IDS,
} from "../lib/featureAccessControl";

export const myPremiumMutation = mutation({
  handler: async (ctx, args) => {
    // Enforce feature access - throws ConvexError if denied
    cosnt featureAccessResult = await requireFeatureAccess(ctx, BOOLEAN_FEATURE_IDS.GITHUB_INTEGRATION);
    if (featureAccessResult?.success === false) {
      throw new Error(featureAccessResult?.message);
    }

    // Proceed with premium feature logic...
  },
});
```

**Frontend UI Gating (`components/billing/FeatureGate.tsx`):**

```typescript
import { FeatureGate, UpgradePrompt } from "@/components/billing/FeatureGate";

function MyComponent() {
  return (
    <FeatureGate
      featureId="custom_domains"
      fallback={<UpgradePrompt featureId="custom_domains" variant="compact" />}
    >
      <PremiumFeatureUI />
    </FeatureGate>
  );
}
```

**Feature Access Hook:**

```typescript
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

function MyComponent() {
  const { hasAccess, isLoading } = useFeatureAccess("github_integration");

  if (isLoading) return <Spinner />;
  if (!hasAccess) return <UpgradePrompt featureId="github_integration" />;

  return <PremiumFeature />;
}
```

### How Feature Access Works

1. **Feature Flag Check**: First checks if `billing_enforcement` is enabled

   - If disabled: All features are accessible (development/testing mode)
   - If enabled: Proceeds to plan check

2. **Plan Check**: Queries Autumn customer data via `autumn.api().query()`

   - Checks `customer.features[featureId].has_access` boolean
   - Returns true if user's plan includes the feature

3. **Enforcement**:
   - **Backend**: Throws `ConvexError` with message "Access denied: {feature} requires {plan}"
   - **Frontend**: Hides feature UI and shows upgrade prompt

### Files Created

- `convex/lib/featureAccessControl.ts` - Backend enforcement utilities
- `lib/billing/feature-access-utils.ts` - Shared feature access logic
- `components/billing/FeatureGate.tsx` - UI gating components
- `hooks/useFeatureAccess.ts` - React hooks for feature access

## Example: Deploying Billing

```bash
# 1. Deploy code with billing feature flag disabled by default
git push

# 2. Test in production (flag is off, no billing)
# Verify agent works normally

# 3. Enable billing in Convex dashboard
# Run mutation: setFlag({ key: "billing_enforcement", enabled: true })

# 4. Monitor for issues
# Check logs for billing errors

# 5. If issues: KILL SWITCH
# Run mutation: setFlag({ key: "billing_enforcement", enabled: false })
```
