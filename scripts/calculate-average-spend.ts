import { stripeServer } from 'common/src/util/stripe'
import type Stripe from 'stripe'

async function calculateAverageSpend() {
  console.log('Calculating spend per subscriber...')

  let hasMore = true
  let startingAfter: string | undefined = undefined
  let totalSpend = 0
  let customerSpends = new Map<string, number>()
  let customerFirstInvoiceDates = new Map<string, number>()
  let batchCount = 0

  try {
    // Get all invoices from the last 2 months to establish customer history
    const twoMonthsAgo = Date.now() - 1000 * 60 * 60 * 24 * 60
    const oneMonthAgo = Date.now() - 1000 * 60 * 60 * 24 * 30

    // First get all invoices to establish customer history
    while (hasMore) {
      batchCount++

      const invoices: Stripe.Response<Stripe.ApiList<Stripe.Invoice>> =
        await stripeServer.invoices.list({
          limit: 100,
          starting_after: startingAfter,
          created: {
            gte: Math.floor(twoMonthsAgo / 1000),
          },
          status: 'paid',
        })

      // Process each invoice
      for (const invoice of invoices.data) {
        if (!invoice.customer) continue

        const customerId =
          typeof invoice.customer === 'string'
            ? invoice.customer
            : invoice.customer.id

        // Track customer's first invoice date
        const currentFirstDate = customerFirstInvoiceDates.get(customerId) || Infinity
        const invoiceDate = invoice.created
        customerFirstInvoiceDates.set(customerId, Math.min(currentFirstDate, invoiceDate))

        const currentSpend = customerSpends.get(customerId) || 0
        // Only count spend from last month
        if (invoice.created >= Math.floor(oneMonthAgo / 1000)) {
          customerSpends.set(customerId, currentSpend + invoice.amount_paid)
        }
      }

      hasMore = invoices.has_more
      if (hasMore && invoices.data.length > 0) {
        startingAfter = invoices.data[invoices.data.length - 1].id
      }
    }

    // Calculate total spend and identify new vs existing customers
    totalSpend = 0
    let newCustomerSpend = 0
    let existingCustomerSpend = 0
    let newCustomers = 0
    let existingCustomers = 0

    for (const [customerId, spend] of customerSpends.entries()) {
      totalSpend += spend
      const firstInvoiceDate = customerFirstInvoiceDates.get(customerId)
      if (firstInvoiceDate && firstInvoiceDate >= Math.floor(oneMonthAgo / 1000)) {
        newCustomerSpend += spend
        newCustomers++
      } else {
        existingCustomerSpend += spend
        existingCustomers++
      }
    }

    // Convert from cents to dollars
    const totalCustomers = customerSpends.size
    console.log(`Total unique customers found: ${totalCustomers} (${newCustomers} new, ${existingCustomers} existing)`)
    console.log(`Total monthly spend: $${(totalSpend / 100).toFixed(2)}`)
    console.log(`  New customers: $${(newCustomerSpend / 100).toFixed(2)}`)
    console.log(`  Existing customers: $${(existingCustomerSpend / 100).toFixed(2)}`)
    if (existingCustomers > 0) {
      console.log(`Average spend per existing customer: $${(existingCustomerSpend / (existingCustomers * 100)).toFixed(2)}`)
    }

    // Print distribution of spend
    console.log('\nSpend distribution:')
    const spendRanges = new Map<string, number>()
    for (const spend of customerSpends.values()) {
      const spendInDollars = spend / 100
      if (spendInDollars <= 50)
        spendRanges.set('$0-50', (spendRanges.get('$0-50') || 0) + 1)
      else if (spendInDollars <= 100)
        spendRanges.set('$51-100', (spendRanges.get('$51-100') || 0) + 1)
      else if (spendInDollars <= 500)
        spendRanges.set('$101-500', (spendRanges.get('$101-500') || 0) + 1)
      else spendRanges.set('$500+', (spendRanges.get('$500+') || 0) + 1)
    }

    // Print spend ranges in decreasing order
    const sortedRanges = Array.from(spendRanges.entries()).sort(
      (a, b) => b[1] - a[1]
    )
    for (const [range, count] of sortedRanges) {
      console.log(`${range}: ${count} customers`)
    }

    // Print individual overages in decreasing order
    console.log('\nTop spenders:')
    const sortedSpends = Array.from(customerSpends.values())
      .map((spend) => spend / 100)
      .filter((spend) => spend > 49)
      .sort((a, b) => b - a)

    for (const spend of sortedSpends) {
      console.log(`$${spend.toFixed(2)}`)
    }
  } catch (error) {
    console.error('Error calculating average spend:', error)
  }
}

// Run the script
calculateAverageSpend()
