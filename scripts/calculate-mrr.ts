import { stripeServer } from 'common/src/util/stripe'
import type Stripe from 'stripe'

async function calculateMRR() {
  console.log('Calculating MRR...')

  let totalMRR = 0
  let hasMore = true
  let startingAfter: string | undefined = undefined
  let totalSubscriptions = 0

  try {
    // Paginate through all active subscriptions
    while (hasMore) {
      const subscriptions: Stripe.Response<
        Stripe.ApiList<Stripe.Subscription>
      > = await stripeServer.subscriptions.list({
        limit: 100,
        starting_after: startingAfter,
        status: 'active',
        expand: ['data.items.data.price'],
      })

      // Process each subscription
      for (const subscription of subscriptions.data) {
        // Skip subscriptions that are scheduled to be canceled
        if (subscription.cancel_at_period_end) {
          continue
        }

        totalSubscriptions++
        // Get the base subscription price (licensed item)
        const basePriceItem = subscription.items.data.find(
          (item: Stripe.SubscriptionItem) =>
            item.price.recurring?.usage_type === 'licensed'
        )

        if (basePriceItem?.price.unit_amount) {
          totalMRR += basePriceItem.price.unit_amount
        }
      }

      hasMore = subscriptions.has_more
      if (hasMore && subscriptions.data.length > 0) {
        startingAfter = subscriptions.data[subscriptions.data.length - 1].id
      }
    }

    // Convert from cents to dollars
    const mrrInDollars = totalMRR / 100

    console.log(`\nProcessed ${totalSubscriptions} total subscriptions`)
    console.log(`Total MRR: $${mrrInDollars.toFixed(2)}`)
    console.log(`Annual Run Rate (ARR): $${(mrrInDollars * 12).toFixed(2)}`)
  } catch (error) {
    console.error('Error calculating MRR:', error)
  }
}

// Run the script
calculateMRR()
