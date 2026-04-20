import type Stripe from 'stripe'

export function getSubscriptionItemByType(
  subscription: Stripe.Subscription,
  usageType: 'licensed' | 'metered',
) {
  return subscription.items.data.find(
    (item) => item.price.recurring?.usage_type === usageType,
  )
}
