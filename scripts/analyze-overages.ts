import { stripeServer } from 'common/src/util/stripe'
import type Stripe from 'stripe'

// Utility functions copied from web/src/lib/stripe-utils.ts
function getSubscriptionItemByType(
  subscription: Stripe.Subscription,
  usageType: 'licensed' | 'metered'
): Stripe.SubscriptionItem | undefined {
  return subscription.items.data.find(
    (item) => item.price.recurring?.usage_type === usageType
  )
}

interface CustomerStats {
  id: string
  usage: number
  overage: number
  invoiceTotal: number
}

async function analyzeOverages(): Promise<void> {
  console.log('Analyzing customer overages...')

  const customerStats: CustomerStats[] = []
  let totalCustomersWithOverages = 0

  try {
    // Get all active subscriptions using pagination
    console.log('Fetching active subscriptions...')
    const activeCustomers = new Set<string>()
    let startingAfter: string | undefined = undefined
    let hasMore = true
    let totalFetchedSubscriptions = 0

    while (hasMore) {
      const subscriptions: any = await stripeServer.subscriptions.list({
        limit: 100, // Fetch in batches of 100
        status: 'active',
        expand: ['data.customer'],
        starting_after: startingAfter,
      })

      totalFetchedSubscriptions += subscriptions.data.length

      for (const subscription of subscriptions.data) {
        if (subscription.customer) {
          const customerId =
            typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer.id
          activeCustomers.add(customerId)
        }
      }

      hasMore = subscriptions.has_more
      if (hasMore && subscriptions.data.length > 0) {
        startingAfter = subscriptions.data[subscriptions.data.length - 1].id
      } else {
        hasMore = false // Exit loop if no more data or last batch was empty
      }
      console.log(
        `Fetched ${totalFetchedSubscriptions} subscriptions so far...`
      )
    }

    console.log(`Found ${activeCustomers.size} active subscribers in total`)

    // For each active customer, get their invoice history
    console.log('\nAnalyzing invoices for established customers...')
    console.log('(Only showing customers with more than one paid invoice)\n')

    let processedCustomers = 0
    for (const customerId of activeCustomers) {
      processedCustomers++
      console.log(
        `Processing customer ${processedCustomers}/${activeCustomers.size}: ${customerId}`
      )
      // Get customer's paid invoices
      const invoices = await stripeServer.invoices.list({
        customer: customerId,
        limit: 10, // Just get the most recent 10 invoices
        status: 'paid',
        expand: ['data.subscription', 'data.lines.data.price'],
      })

      // Skip if less than 2 paid invoices
      if (invoices.data.length < 2) continue

      // Analyze most recent invoice
      const latestInvoice = invoices.data[0]
      if (!latestInvoice.subscription) continue

      let hasOverage = false

      // Find metered items and calculate overages
      for (const item of latestInvoice.lines.data) {
        if (item.price?.billing_scheme === 'tiered') {
          const price = await stripeServer.prices.retrieve(item.price.id, {
            expand: ['tiers'],
          })

          const firstTier = price.tiers?.[0]
          const quantity = item.quantity ?? 0
          if (firstTier?.up_to && quantity > firstTier.up_to) {
            hasOverage = true
            const overageQuantity = quantity - firstTier.up_to
            const overageRate = parseFloat(
              price.tiers?.[1]?.unit_amount_decimal || '0'
            )
            const calculatedOverage = overageQuantity * overageRate

            console.log(`\nCustomer ${customerId}:`)
            console.log(
              `  Usage: ${quantity} units (${overageQuantity} above ${firstTier.up_to} base tier)`
            )
            console.log(
              `  Overage rate: $${(overageRate / 100).toFixed(2)} per unit`
            )
            console.log(
              `  Overage amount: $${(calculatedOverage / 100).toFixed(2)}`
            )
            console.log(
              `  Invoice total: $${(latestInvoice.amount_paid / 100).toFixed(2)}`
            )
            console.log(
              `  Invoice date: ${new Date(
                latestInvoice.created * 1000
              ).toISOString()}`
            )
            console.log(`  Total paid invoices: ${invoices.data.length}`)
            console.log()

            customerStats.push({
              id: customerId,
              usage: quantity,
              overage: calculatedOverage,
              invoiceTotal: latestInvoice.amount_paid,
            })

            if (hasOverage) {
              totalCustomersWithOverages++
            }
          }
        }
      }
    }

    // Print summary statistics
    console.log('\n=== Summary Statistics ===')
    const totalEstablishedCustomers = customerStats.length
    const totalOverage = customerStats.reduce((sum, c) => sum + c.overage, 0) / 100 // Convert to dollars

    console.log('\nOverall Summary:')
    console.log(`Total Established Customers: ${totalEstablishedCustomers}`)
    console.log(`Total Customers with Overages: ${totalCustomersWithOverages}`)
    console.log(`Total overage charges: $${totalOverage.toFixed(2)}`)

    // Calculate average overage across only customers *with* overages
    const avgOverageAmongstOveragers = totalCustomersWithOverages > 0 ? totalOverage / totalCustomersWithOverages : 0
    console.log(
      `Average overage (among those with overages): $${avgOverageAmongstOveragers.toFixed(2)}`
    )

    // Distribution across all customers combined, based on DOLLARS
    const combinedUsageBuckets = {
      small: 0, // $0-$50 overage
      medium: 0, // $50-$100 overage
      large: 0, // $100+ overage
    }

    for (const customer of customerStats) {
      const overageAmountDollars = customer.overage / 100 // Convert cents to dollars
      if (overageAmountDollars <= 50) combinedUsageBuckets.small++
      else if (overageAmountDollars <= 100) combinedUsageBuckets.medium++
      else combinedUsageBuckets.large++
    }

    console.log('\nCombined Overage Distribution (among those with overages):')
    console.log(
      `Small overages ($0-$50): ${combinedUsageBuckets.small} customers`
    )
    console.log(
      `Medium overages ($50-$100): ${combinedUsageBuckets.medium} customers`
    )
    console.log(
      `Large overages ($100+): ${combinedUsageBuckets.large} customers`
    )
  } catch (error) {
    console.error('Error analyzing overages:', error)
  }
}

// Run the script
analyzeOverages()
