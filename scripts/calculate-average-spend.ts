import { stripeServer } from 'common/src/util/stripe'
import type Stripe from 'stripe'

async function calculateAverageSpend() {
  console.log('Calculating spend per subscriber...')

  let hasMore = true
  let startingAfter: string | undefined = undefined
  let totalSpend = 0
  let customerSpends = new Map<string, number>()
  let batchCount = 0

  try {
    // Get all invoices from the last month
    const oneMonthAgo = Date.now() - 1000 * 60 * 60 * 24 * 30

    // Get all invoices
    while (hasMore) {
      batchCount++
      
      const invoices: Stripe.Response<Stripe.ApiList<Stripe.Invoice>> = await stripeServer.invoices.list({
        limit: 100,
        starting_after: startingAfter,
        created: {
          gte: Math.floor(oneMonthAgo / 1000),
        },
        status: 'paid',
      })

      // Process each invoice
      for (const invoice of invoices.data) {
        if (!invoice.customer) continue

        const customerId = typeof invoice.customer === 'string' 
          ? invoice.customer 
          : invoice.customer.id

        const currentSpend = customerSpends.get(customerId) || 0
        customerSpends.set(customerId, currentSpend + invoice.amount_paid)
        totalSpend += invoice.amount_paid
      }

      hasMore = invoices.has_more
      if (hasMore && invoices.data.length > 0) {
        startingAfter = invoices.data[invoices.data.length - 1].id
      }
    }

    // Convert from cents to dollars
    const totalCustomers = customerSpends.size
    const averageSpend = totalSpend / (totalCustomers * 100)

    console.log(`Total unique customers found: ${totalCustomers}`)
    console.log(`Average monthly spend per customer: $${averageSpend.toFixed(2)}`)
    console.log(`Total monthly spend: $${(totalSpend / 100).toFixed(2)}`)

    // Print distribution of spend
    console.log('\nSpend distribution:')
    const spendRanges = new Map<string, number>()
    for (const spend of customerSpends.values()) {
      const spendInDollars = spend / 100
      if (spendInDollars <= 50) spendRanges.set('$0-50', (spendRanges.get('$0-50') || 0) + 1)
      else if (spendInDollars <= 100) spendRanges.set('$51-100', (spendRanges.get('$51-100') || 0) + 1)
      else if (spendInDollars <= 500) spendRanges.set('$101-500', (spendRanges.get('$101-500') || 0) + 1)
      else spendRanges.set('$500+', (spendRanges.get('$500+') || 0) + 1)
    }
    for (const [range, count] of spendRanges.entries()) {
      console.log(`${range}: ${count} customers`)
    }

  } catch (error) {
    console.error('Error calculating average spend:', error)
  }
}

// Run the script
calculateAverageSpend()
