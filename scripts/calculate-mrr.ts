import { stripeServer } from 'common/src/util/stripe'
import type Stripe from 'stripe'

async function calculateMRR() {
  console.log('Calculating MRR...')

  let totalMRR = 0
  let totalPastDueMRR = 0
  let totalPastDueInvoices = 0
  let totalSubscriptions = 0

  try {
    // First get active subscriptions
    let hasMore = true
    let startingAfter: string | undefined = undefined

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
          console.log(`Active base MRR for customer ${subscription.customer}: $${(basePriceItem.price.unit_amount/100).toFixed(2)}`)
        }
      }

      hasMore = subscriptions.has_more
      if (hasMore && subscriptions.data.length > 0) {
        startingAfter = subscriptions.data[subscriptions.data.length - 1].id
      }
    }

    // Now get past_due subscriptions
    hasMore = true
    startingAfter = undefined

    while (hasMore) {
      const subscriptions: Stripe.Response<
        Stripe.ApiList<Stripe.Subscription>
      > = await stripeServer.subscriptions.list({
        limit: 100,
        starting_after: startingAfter,
        status: 'past_due',
        expand: ['data.items.data.price'],
      })

      // Process each subscription
      for (const subscription of subscriptions.data) {
        totalSubscriptions++
        // Get the base subscription price (licensed item)
        const basePriceItem = subscription.items.data.find(
          (item: Stripe.SubscriptionItem) =>
            item.price.recurring?.usage_type === 'licensed'
        )

        if (basePriceItem?.price.unit_amount) {
          totalPastDueMRR += basePriceItem.price.unit_amount
          console.log(`Past due base MRR for customer ${subscription.customer}: $${(basePriceItem.price.unit_amount/100).toFixed(2)}`)
          totalPastDueInvoices++
        }
      }

      hasMore = subscriptions.has_more
      if (hasMore && subscriptions.data.length > 0) {
        startingAfter = subscriptions.data[subscriptions.data.length - 1].id
      }
    }

    // Convert from cents to dollars
    const mrrInDollars = totalMRR / 100
    const pastDueMRRInDollars = totalPastDueMRR / 100

    console.log(`\nProcessed ${totalSubscriptions} total subscriptions`)
    console.log(`Found ${totalPastDueInvoices} past due subscriptions`)
    console.log(`Base MRR (from active subscriptions): $${mrrInDollars.toFixed(2)}`)
    console.log(`Past Due Base MRR: $${pastDueMRRInDollars.toFixed(2)}`)
    console.log(`Total Base MRR: $${(mrrInDollars + pastDueMRRInDollars).toFixed(2)}`)
    console.log(`Annual Base Run Rate (ARR): $${((mrrInDollars + pastDueMRRInDollars) * 12).toFixed(2)}`)
  } catch (error) {
    console.error('Error calculating MRR:', error)
  }
}

// Run the script
calculateMRR()
