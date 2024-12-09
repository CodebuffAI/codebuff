import { stripeServer } from 'common/src/util/stripe'
import Stripe from 'stripe'
import { env } from '../web/src/env.mjs'

async function migrateCustomers() {
  try {
    // Get all customers

    let hasMore = true
    let customers: Stripe.Customer[] = []
    let starting_after: string | undefined = undefined

    console.log('Loading customers...')
    while (hasMore) {
      const currCustomers: any = await stripeServer.customers.list({
        limit: 100, // Adjust as needed
        expand: ['data.subscriptions'],
        starting_after,
      })
      customers = customers.concat(currCustomers.data)
      hasMore = currCustomers.has_more
      if (hasMore) {
        starting_after = currCustomers.data[currCustomers.data.length - 1].id
      }
    }

    console.log(`Found ${customers.length} customers to process`)

    for (const customer of customers) {
      try {
        const subscription = customer.subscriptions?.data[0]
        if (!subscription) {
          // console.log(`No subscription found for customer ${customer.id}`)
          continue
        }

        // Skip customers not on $99/mo plan
        if (
          !subscription.items.data.some(
            (item) => item.price.id === 'price_1QM4E3KrNS6SjmqW4J7hl1Fv'
          )
        ) {
          console.log(`Skipping customer ${customer.id} on non-$99/mo plan`)
          continue
        }

        // Get current usage from billing meters
        let amt = 0
        try {
          const usage = await stripeServer.billing.meters.listEventSummaries(
            'mtr_61RVPFQEPNI08hEEf41KrNS6SjmqWLiS',
            {
              customer: customer.id,
              start_time: subscription.current_period_start,
              end_time: subscription.current_period_end,
            }
          )
          amt = usage.data[0].aggregated_value
        } catch (error) {
          console.error(
            `Error getting usage for customer ${customer.id}: ${error.message}`
          )
        }

        console.log(`Usage for ${customer.id} (${customer.email}): ${amt}`)

        // Map existing items to their new prices
        const items = subscription.items.data.map((item) => {
          if (item.price.recurring?.usage_type === 'licensed') {
            return {
              id: item.id, // Keep the existing item ID
              price: env.STRIPE_SUBSCRIPTION_PRICE_ID,
              quantity: 1,
            }
          } else {
            // For metered items (overage), copy over the usage
            const baseItem = {
              id: item.id, // Keep the existing item ID
              price: env.STRIPE_OVERAGE_PRICE_ID,
            }
            // For metered items, set initial quantity to 0
            return baseItem
          }
        })

        // Update subscription with mapped items
        const updatedSubscription = await stripeServer.subscriptions.update(
          subscription.id,
          {
            items,
            coupon: 'wwu4ER94',
            proration_behavior: 'none',
          }
        )

        // Record the usage in the new subscription
        const meterEvent = await stripeServer.billing.meterEvents.create({
          event_name: 'credits',
          payload: {
            stripe_customer_id: customer.id,
            value: amt.toString(),
          },
        })
        console.log(
          `Created meter event ${meterEvent.identifier} for ${amt} credits`
        )

        console.log(
          `Successfully updated subscription ${subscription.id} for customer ${customer.id}`
        )
      } catch (error) {
        console.error(
          `Error updating customer ${customer.id}:`,
          error instanceof Error ? error.message : error
        )
      }
    }

    console.log('Migration completed')
  } catch (error) {
    console.error(
      'Error during migration:',
      error instanceof Error ? error.message : error
    )
    process.exit(1)
  }
}

// Only run if called directly
if (require.main === module) {
  migrateCustomers()
}
