# Seat-Based Pricing Implementation Plan

## Overview
Convert organization billing from a fixed platform fee to seat-based pricing where `STRIPE_TEAM_FEE_PRICE_ID` charges per member.

## Changes Required

### 1. Update Billing Setup (Initial Subscription)
**File:** `web/src/app/api/orgs/[orgId]/billing/setup/route.ts`

- Fetch current member count for the organization
- Set `quantity` for `STRIPE_TEAM_FEE_PRICE_ID` line item to member count (minimum 1)

```typescript
// Get member count
const memberCount = await db
  .select({ count: sql<number>`count(*)` })
  .from(schema.orgMember)
  .where(eq(schema.orgMember.org_id, orgId))

// Update line_items
line_items: [
  {
    price: env.STRIPE_TEAM_FEE_PRICE_ID,
    quantity: Math.max(1, memberCount[0].count), // Minimum 1 seat
  },
]
```

### 2. Update Member Addition
**File:** `web/src/app/api/orgs/[orgId]/members/route.ts` (POST)

After successfully adding member to database:
- Retrieve organization's `stripe_subscription_id`
- Find subscription item for `STRIPE_TEAM_FEE_PRICE_ID`
- Increment quantity by 1

```typescript
// After successful member addition
if (organization.stripe_subscription_id) {
  const subscription = await stripeServer.subscriptions.retrieve(
    organization.stripe_subscription_id
  )
  
  const teamFeeItem = subscription.items.data.find(
    item => item.price.id === env.STRIPE_TEAM_FEE_PRICE_ID
  )
  
  if (teamFeeItem) {
    await stripeServer.subscriptionItems.update(teamFeeItem.id, {
      quantity: teamFeeItem.quantity + 1
    })
  }
}
```

### 3. Update Member Removal
**File:** `web/src/app/api/orgs/[orgId]/members/[userId]/route.ts` (DELETE)

After successfully removing member from database:
- Retrieve organization's `stripe_subscription_id`
- Find subscription item for `STRIPE_TEAM_FEE_PRICE_ID`
- Decrement quantity by 1 (minimum 1)

```typescript
// After successful member removal
if (organization.stripe_subscription_id) {
  const subscription = await stripeServer.subscriptions.retrieve(
    organization.stripe_subscription_id
  )
  
  const teamFeeItem = subscription.items.data.find(
    item => item.price.id === env.STRIPE_TEAM_FEE_PRICE_ID
  )
  
  if (teamFeeItem) {
    await stripeServer.subscriptionItems.update(teamFeeItem.id, {
      quantity: Math.max(1, teamFeeItem.quantity - 1) // Minimum 1 seat
    })
  }
}
```

### 4. Add Unsubscribe Functionality
**File:** `web/src/app/api/orgs/[orgId]/billing/subscription/route.ts` (new file)

Create DELETE endpoint to cancel subscription:
- Verify user permissions (owner/admin only)
- Cancel Stripe subscription
- Clear `stripe_subscription_id` from organization record
- Optionally disable auto-topup

```typescript
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  // Permission checks
  // Cancel subscription
  await stripeServer.subscriptions.cancel(organization.stripe_subscription_id)
  
  // Update database
  await db
    .update(schema.org)
    .set({
      stripe_subscription_id: null,
      auto_topup_enabled: false,
      updated_at: new Date(),
    })
    .where(eq(schema.org.id, orgId))
}
```

### 5. Bulk Member Operations
**File:** `web/src/app/api/orgs/[orgId]/invitations/bulk/route.ts` (new file)

Create POST endpoint for bulk member invitations:
- Accept array of email/role pairs
- Add all members to database in a transaction
- Update Stripe subscription quantity once with total count

```typescript
interface BulkInviteRequest {
  invitations: Array<{
    email: string
    role: 'admin' | 'member'
  }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const body: BulkInviteRequest = await req.json()
  
  // Validate permissions and find users
  const validInvitations = await validateBulkInvitations(body.invitations)
  
  // Add all members in transaction
  const addedCount = await db.transaction(async (tx) => {
    let count = 0
    for (const invitation of validInvitations) {
      await tx.insert(schema.orgMember).values({
        org_id: orgId,
        user_id: invitation.userId,
        role: invitation.role,
      })
      count++
    }
    return count
  })
  
  // Update Stripe subscription quantity once
  if (addedCount > 0 && organization.stripe_subscription_id) {
    const subscription = await stripeServer.subscriptions.retrieve(
      organization.stripe_subscription_id
    )
    
    const teamFeeItem = subscription.items.data.find(
      item => item.price.id === env.STRIPE_TEAM_FEE_PRICE_ID
    )
    
    if (teamFeeItem) {
      await stripeServer.subscriptionItems.update(teamFeeItem.id, {
        quantity: teamFeeItem.quantity + addedCount
      })
    }
  }
}
```

### 6. Prorated Billing Configuration
**Implementation Notes:**

Stripe handles prorated billing automatically when subscription quantities change:
- **Default Behavior**: `proration_behavior: 'create_prorations'`
- **Mid-cycle additions**: Users are charged prorated amount immediately
- **Mid-cycle removals**: Credit is applied to next invoice
- **Billing anchor**: Maintains original billing cycle date

Ensure proration settings are explicit in subscription updates:

```typescript
await stripeServer.subscriptionItems.update(teamFeeItem.id, {
  quantity: newQuantity,
  proration_behavior: 'create_prorations', // Explicit proration
  proration_date: Math.floor(Date.now() / 1000), // Current timestamp
})
```

**Proration Considerations:**
- Immediate charges for seat additions
- Credits for seat removals applied to next billing cycle
- Partial month calculations handled automatically
- Invoice line items show prorated amounts clearly

### 7. Enhance Webhook Handling
**File:** `web/src/app/api/stripe/webhook/route.ts`

Improve `handleSubscriptionEvent` to handle:
- Subscription cancellations
- Subscription updates
- Failed payments

## Error Handling Considerations

1. **Stripe API Failures**: Log errors and consider retry mechanisms
2. **Database Consistency**: Ensure DB and Stripe stay in sync
3. **Minimum Seat Count**: Always maintain at least 1 seat
4. **Permission Validation**: Verify user authorization for all operations
5. **Bulk Operation Failures**: Handle partial failures gracefully
6. **Proration Edge Cases**: Monitor for unexpected billing amounts

## Testing Strategy

1. Test member addition/removal with active subscriptions
2. Test billing setup with different member counts
3. Test unsubscribe functionality
4. Test webhook handling for subscription events
5. Verify error handling for API failures
6. **Test bulk operations with various scenarios**
7. **Verify prorated billing calculations**
8. **Test mid-cycle member changes**