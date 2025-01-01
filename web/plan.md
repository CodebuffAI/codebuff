# Plan: Subscription Flow Improvements

## Overview

Improve the subscription upgrade/downgrade flow to be clearer, more immediate, and provide better feedback to users.

## Required Changes

### 1. Current Plan Indication

- Disable and visually indicate current plan on pricing page
  - Gray out button for current plan
  - Add "Current Plan" badge
  - Show subscription status (active/cancelled)
  - Keep button enabled if subscription is cancelled but hasn't ended yet
  - Show renewal/cancellation date

### 2. Upgrade Flow

- Add confirmation page before Stripe checkout
  - Show clear breakdown of changes
  - Display immediate charges vs future billing
  - Explain proration calculation
  - Show new monthly rate
  - Highlight credit limit changes
  - Show overage rate changes

### 3. Immediate Billing

- Implement immediate proration charges
  - Calculate remaining days in billing period
  - Show clear breakdown of immediate charge
  - Explain that overage isn't included yet
  - Update subscription.update API to handle proration
  - Use Stripe's proration preview API
  - Show exact amount to be charged now

### 4. Subscription Management

- Add subscription details page
  - Show current usage vs limit
  - Display billing period dates
  - List recent charges
  - Show upcoming charges
  - Proration calculations for changes
  - Cancel/modify subscription options

### 5. API Changes Required

1. Subscription Preview Endpoint:

   ```typescript
   GET /api/stripe/subscription/preview
   Query params: targetPlan (pro | moar-pro)
   Returns:
   - Immediate charge amount
   - New monthly rate
   - Credit limit changes
   - Proration calculations
   ```

2. Update Subscription Endpoint:
   ```typescript
   POST / api / stripe / subscription
   Body: {
     plan: 'pro' | 'moar-pro'
     immediateCharge: boolean
   }
   ```

### 6. Database Updates

- Add fields to track:
  - Subscription status changes
  - Proration charges
  - Credit limit changes
  - Billing period adjustments

### 7. Edge Cases to Handle

- Failed payments during upgrade
- Mid-period upgrades/downgrades
- Subscription cancellations
- Credit limit changes during active period
- Overage charges during plan changes

## Implementation Steps

1. First Phase:

   - Add plan preview endpoint
   - Create confirmation page UI
   - Implement current plan indication
   - Add subscription details page

2. Second Phase:

   - Update subscription endpoint for immediate billing
   - Implement proration calculations
   - Add clear billing explanations
   - Handle edge cases

3. Third Phase:
   - Add usage tracking improvements
   - Implement subscription management
   - Add billing history
   - Final testing

## Technical Considerations

### Proration Handling

- Use Stripe's built-in proration
- Calculate remaining days in billing period
- Apply credit for unused time on old plan
- Charge difference immediately for upgrades

### Edge Cases

- Handle downgrades (pro to basic)
- Preserve referral credits in all cases
- Handle failed payments during switch
- Consider timezone differences in billing periods

### Testing Requirements

- Test all upgrade paths
- Verify proration calculations
- Check immediate billing
- Validate edge cases
- Test failed payment scenarios

## Success Metrics

- Reduced support tickets about billing
- Higher upgrade completion rate
- Fewer failed payments
- Better user understanding of charges
- Increased user satisfaction with billing clarity

## Questions to Resolve

1. How to handle partial period overage charges?
2. Should we allow downgrades to take effect immediately?
3. How to handle credits earned during transition periods?
4. What happens to unused credits during downgrades?

## Next Steps

1. Create UI mockups for confirmation page
2. Implement preview endpoint
3. Add current plan indication
4. Build subscription management page
