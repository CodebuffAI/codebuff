import { stripeServer } from 'common/src/util/stripe'
import type Stripe from 'stripe'
import { PLAN_CONFIGS, UsageLimits } from 'common/constants'

// Utility functions copied from web/src/lib/stripe-utils.ts
function getSubscriptionItemByType(
  subscription: Stripe.Subscription,
  usageType: 'licensed' | 'metered'
): Stripe.SubscriptionItem | undefined {
  return subscription.items.data.find(
    (item) => item.price.recurring?.usage_type === usageType
  )
}

function getPlanFromPriceId(priceId: string | undefined): UsageLimits {
  if (priceId === 'price_1QTAXZKrNS6SjmqW8vYaDtLT') {
    // Pro
    return UsageLimits.PRO
  }
  if (priceId === 'price_1QTzRYKrNS6SjmqW2LPrJAVi') {
    // Pro Plus
    return UsageLimits.MOAR_PRO
  }
  return UsageLimits.FREE
}

interface CustomerStats {
  id: string
  usage: number
  overage: number
  invoiceTotal: number
}

interface PlanStats {
  totalOverage: number
  customerCount: number
  customers: CustomerStats[]
}

async function analyzeOverages(): Promise<void> {
  console.log('Analyzing customer overages...')

  const statsByPlan = new Map<keyof typeof UsageLimits, PlanStats>()

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

      // Get the plan
      const plan =
        typeof latestInvoice.subscription !== 'string' &&
        latestInvoice.subscription !== null
          ? getPlanFromPriceId(
              getSubscriptionItemByType(latestInvoice.subscription, 'licensed')
                ?.price.id
            )
          : undefined

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
            console.log(`  Plan: ${plan}`)
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

            // Update statistics
            if (plan) {
              const planStats = statsByPlan.get(plan) || {
                totalOverage: 0,
                customerCount: 0,
                customers: [],
              }
              planStats.totalOverage += calculatedOverage
              planStats.customers.push({
                id: customerId,
                usage: quantity,
                overage: calculatedOverage,
                invoiceTotal: latestInvoice.amount_paid,
              })
              statsByPlan.set(plan, planStats)
            }
          }
        }
      }

      // Count this customer in their plan's stats if they have >1 invoice
      if (plan && invoices.data.length > 1) {
        const planStats = statsByPlan.get(plan) || {
          totalOverage: 0,
          customerCount: 0,
          customers: [],
        }
        planStats.customerCount++
        if (!hasOverage) {
          planStats.customers.push({
            id: customerId,
            usage: 0, // No usage above base tier if no overage
            overage: 0,
            invoiceTotal: latestInvoice.amount_paid,
          })
        }
        statsByPlan.set(plan, planStats)
      }
    }

    // Print summary statistics
    console.log('\n=== Summary Statistics ===')
    let totalMRR = 0
    let totalOverage = 0
    let totalCustomersWithOverages = 0 // Added for overall summary

    for (const [plan, stats] of statsByPlan.entries()) {
      // Filter customers who actually had overages
      const customersWithOverage = stats.customers.filter((c) => c.overage > 0)
      const numCustomersWithOverage = customersWithOverage.length
      totalCustomersWithOverages += numCustomersWithOverage // Accumulate for overall summary

      // Calculate average overage based only on customers who had overages
      const avgOverage =
        numCustomersWithOverage > 0
          ? stats.totalOverage / (numCustomersWithOverage * 100) // Convert cents to dollars
          : 0

      const planConfig = PLAN_CONFIGS[plan as UsageLimits]
      const basePrice = planConfig?.monthlyPrice || 0
      // Use stats.customerCount for MRR calculation as it represents all established customers on the plan
      const baseMRR = basePrice * stats.customerCount
      totalMRR += baseMRR
      totalOverage += stats.totalOverage / 100 // Convert cents to dollars

      console.log(`\n${plan}:`)
      // Correctly report the number of customers *with* overages
      console.log(`  Number of established customers: ${stats.customerCount}`)
      console.log(
        `  Number of customers with overages: ${numCustomersWithOverage}`
      )
      console.log(
        `  Total overage amount: $${(stats.totalOverage / 100).toFixed(2)}`
      )
      // Report average overage only for those who had overages
      console.log(
        `  Average overage (among those with overages): $${avgOverage.toFixed(2)}`
      )
      console.log(
        `  Base MRR (from established customers): $${baseMRR.toFixed(2)}`
      )
      console.log(
        `  Total Revenue (MRR + overages): $${(
          baseMRR +
          stats.totalOverage / 100
        ).toFixed(2)}`
      )

      // Distribution of usage based on overage amount in DOLLARS
      const usageBuckets = {
        small: 0, // $0-$50 overage
        medium: 0, // $50-$100 overage
        large: 0, // $100+ overage
      }

      // Iterate only over customers with overages for distribution
      for (const customer of customersWithOverage) {
        const overageAmountDollars = customer.overage / 100 // Convert cents to dollars
        if (overageAmountDollars <= 50) usageBuckets.small++
        else if (overageAmountDollars <= 100) usageBuckets.medium++
        else usageBuckets.large++
      }

      console.log('  Overage distribution (among those with overages):')
      console.log(
        `    Small overages ($0-$50): ${usageBuckets.small} customers`
      )
      console.log(
        `    Medium overages ($50-$100): ${usageBuckets.medium} customers`
      )
      console.log(`    Large overages ($100+): ${usageBuckets.large} customers`)
    }

    // Calculate combined averages across all plans
    const totalEstablishedCustomers = Array.from(statsByPlan.values()).reduce(
      (sum, stats) => sum + stats.customerCount,
      0
    )

    console.log('\nOverall Summary:')
    console.log(`Total Established Customers: ${totalEstablishedCustomers}`)
    console.log(`Total Customers with Overages: ${totalCustomersWithOverages}`) // Added
    console.log(`Total MRR (base subscriptions only): $${totalMRR.toFixed(2)}`)
    console.log(`Total overage charges: $${totalOverage.toFixed(2)}`)
    console.log(
      `Total Revenue (MRR + overages): $${(totalMRR + totalOverage).toFixed(2)}`
    )
    const percentageFromOverages =
      totalMRR + totalOverage > 0
        ? (totalOverage / (totalMRR + totalOverage)) * 100
        : 0
    console.log(
      `Percentage of total revenue from overages: ${percentageFromOverages.toFixed(1)}%`
    )

    // Print combined averages for both plans
    console.log('\nCombined Plan Statistics:')
    console.log(
      `Total established customers across all plans: ${totalEstablishedCustomers}`
    )
    console.log(
      `Average base MRR per established customer: $${(totalMRR / totalEstablishedCustomers).toFixed(2)}`
    )
    // Calculate average overage across *all* established customers
    const avgOverageAllCustomers =
      totalEstablishedCustomers > 0
        ? totalOverage / totalEstablishedCustomers
        : 0
    console.log(
      `Average overage per established customer: $${avgOverageAllCustomers.toFixed(2)}`
    )
    // Calculate average overage across only customers *with* overages
    const avgOverageAmongstOveragers =
      totalCustomersWithOverages > 0
        ? totalOverage / totalCustomersWithOverages
        : 0
    console.log(
      `Average overage (among those with overages): $${avgOverageAmongstOveragers.toFixed(2)}`
    )
    const avgTotalRevenue =
      totalEstablishedCustomers > 0
        ? (totalMRR + totalOverage) / totalEstablishedCustomers
        : 0
    console.log(
      `Average total revenue per established customer: $${avgTotalRevenue.toFixed(2)}`
    )

    // Distribution across all plans combined, based on DOLLARS
    const combinedUsageBuckets = {
      small: 0, // $0-$50 overage
      medium: 0, // $50-$100 overage
      large: 0, // $100+ overage
    }

    for (const stats of statsByPlan.values()) {
      // Iterate only over customers with overages
      for (const customer of stats.customers.filter((c) => c.overage > 0)) {
        const overageAmountDollars = customer.overage / 100 // Convert cents to dollars
        if (overageAmountDollars <= 50) combinedUsageBuckets.small++
        else if (overageAmountDollars <= 100) combinedUsageBuckets.medium++
        else combinedUsageBuckets.large++
      }
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
