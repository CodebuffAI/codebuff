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
    // Get all active subscriptions first
    console.log('Fetching active subscriptions...')
    const activeCustomers = new Set<string>()
    const subscriptions = await stripeServer.subscriptions.list({
      limit: 100,
      status: 'active',
      expand: ['data.customer'],
    })

    for (const subscription of subscriptions.data) {
      if (subscription.customer) {
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id
        activeCustomers.add(customerId)
      }
    }

    console.log(`Found ${activeCustomers.size} active subscribers`)

    // For each active customer, get their invoice history
    console.log('\nAnalyzing invoices for established customers...')
    console.log('(Only showing customers with more than one paid invoice)\n')

    for (const customerId of activeCustomers) {
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
        typeof latestInvoice.subscription !== 'string'
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
            usage: 0,
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

    for (const [plan, stats] of statsByPlan.entries()) {
      const avgOverage = stats.totalOverage / (stats.customerCount * 100) // Convert to dollars
      const planConfig = PLAN_CONFIGS[plan as UsageLimits]
      const basePrice = planConfig?.monthlyPrice || 0
      const baseMRR = basePrice * stats.customerCount
      totalMRR += baseMRR
      totalOverage += stats.totalOverage / 100

      console.log(`\n${plan}:`)
      console.log(`  Number of customers with overages: ${stats.customerCount}`)
      console.log(
        `  Total overage amount: $${(stats.totalOverage / 100).toFixed(2)}`
      )
      console.log(`  Average overage per customer: $${avgOverage.toFixed(2)}`)
      console.log(`  Base MRR: $${baseMRR.toFixed(2)}`)
      console.log(
        `  Total Revenue (MRR + overages): $${(
          baseMRR +
          stats.totalOverage / 100
        ).toFixed(2)}`
      )

      // Distribution of usage
      const usageBuckets = {
        small: 0, // 0-5000 over free tier
        medium: 0, // 5000-10000 over free tier
        large: 0, // 10000+ over free tier
      }

      for (const customer of stats.customers) {
        const overageAmount = customer.overage / 100
        if (overageAmount <= 50) usageBuckets.small++
        else if (overageAmount <= 100) usageBuckets.medium++
        else usageBuckets.large++
      }

      console.log('  Usage distribution:')
      console.log(
        `    Small overages ($0-$50): ${usageBuckets.small} customers`
      )
      console.log(
        `    Medium overages ($50-$100): ${usageBuckets.medium} customers`
      )
      console.log(`    Large overages ($100+): ${usageBuckets.large} customers`)
    }

    // Calculate combined averages across all plans
    const totalCustomers = Array.from(statsByPlan.values()).reduce(
      (sum, stats) => sum + stats.customerCount,
      0
    )

    console.log('\nOverall Summary:')
    console.log(`Total MRR (base subscriptions only): $${totalMRR.toFixed(2)}`)
    console.log(`Total overage charges: $${totalOverage.toFixed(2)}`)
    console.log(
      `Total Revenue (MRR + overages): $${(totalMRR + totalOverage).toFixed(2)}`
    )
    console.log(
      `Percentage of total revenue from overages: ${(
        (totalOverage / (totalMRR + totalOverage)) *
        100
      ).toFixed(1)}%`
    )

    // Print combined averages for both plans
    console.log('\nCombined Plan Statistics:')
    console.log(`Total customers across all plans: ${totalCustomers}`)
    console.log(
      `Average base MRR per customer: $${(totalMRR / totalCustomers).toFixed(2)}`
    )
    console.log(
      `Average overage per customer: $${(totalOverage / totalCustomers).toFixed(2)}`
    )
    console.log(
      `Average total revenue per customer: $${(
        (totalMRR + totalOverage) /
        totalCustomers
      ).toFixed(2)}`
    )

    // Distribution across all plans combined
    const combinedUsageBuckets = {
      small: 0, // $0-$50 overage
      medium: 0, // $50-$100 overage
      large: 0, // $100+ overage
    }

    for (const stats of statsByPlan.values()) {
      for (const customer of stats.customers) {
        const overageAmount = customer.overage
        if (overageAmount <= 50) combinedUsageBuckets.small++
        else if (overageAmount <= 100) combinedUsageBuckets.medium++
        else combinedUsageBuckets.large++
      }
    }

    console.log('\nCombined Usage Distribution:')
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
