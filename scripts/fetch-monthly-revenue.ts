import { stripeServer } from '@codebuff/internal/util/stripe'
import { env } from '@codebuff/internal/env'

import type Stripe from 'stripe'

interface MonthlyRevenue {
  month: string
  grossRevenue: number
  fees: number
  refunds: number
  netRevenue: number
  transactionCount: number
}

async function fetchMonthlyRevenue() {
  // Define the months we want to fetch (Sept, Oct, Nov, Dec 2025)
  const months = [
    {
      name: 'September 2025',
      start: new Date('2025-09-01'),
      end: new Date('2025-10-01'),
    },
    {
      name: 'October 2025',
      start: new Date('2025-10-01'),
      end: new Date('2025-11-01'),
    },
    {
      name: 'November 2025',
      start: new Date('2025-11-01'),
      end: new Date('2025-12-01'),
    },
    {
      name: 'December 2025',
      start: new Date('2025-12-01'),
      end: new Date('2026-01-01'),
    },
  ]

  // Check if we're in test or live mode
  const isTestMode = env.STRIPE_SECRET_KEY.startsWith('sk_test_')
  console.log(`Stripe mode: ${isTestMode ? '⚠️  TEST MODE' : '✅ LIVE MODE'}`)
  console.log('Fetching monthly revenue from Stripe (using Balance Transactions)...\n')

  const results: MonthlyRevenue[] = []

  for (const month of months) {
    let hasMore = true
    let startingAfter: string | undefined = undefined
    let grossRevenue = 0
    let fees = 0
    let refunds = 0
    let transactionCount = 0
    let batchCount = 0
    const MAX_BATCHES = 1000 // Safety limit

    console.log(`Fetching ${month.name}...`)

    try {
      while (hasMore && batchCount < MAX_BATCHES) {
        batchCount++
        const transactions: Stripe.Response<Stripe.ApiList<Stripe.BalanceTransaction>> =
          await stripeServer.balanceTransactions.list({
            starting_after: startingAfter,
            created: {
              gte: Math.floor(month.start.getTime() / 1000),
              lt: Math.floor(month.end.getTime() / 1000),
            },
            // Don't filter by type - get all transactions to match Stripe dashboard
            limit: 100,
          })

        for (const txn of transactions.data) {
          if (txn.type === 'charge' || txn.type === 'payment') {
            grossRevenue += txn.amount
            fees += txn.fee
            transactionCount++
          } else if (txn.type === 'refund') {
            refunds += Math.abs(txn.amount) // refunds are negative, make positive for display
          }
        }

        if (batchCount % 10 === 0) {
          console.log(
            `  Batch ${batchCount}: ${transactionCount} charges, $${(grossRevenue / 100).toFixed(2)} gross`,
          )
        }

        hasMore = transactions.has_more
        if (hasMore && transactions.data.length > 0) {
          startingAfter = transactions.data[transactions.data.length - 1].id
        }
      }

      if (batchCount >= MAX_BATCHES) {
        console.warn(`Warning: Hit max batch limit for ${month.name}`)
      }

      const netRevenue = grossRevenue - fees - refunds
      results.push({
        month: month.name,
        grossRevenue,
        fees,
        refunds,
        netRevenue,
        transactionCount,
      })

      console.log(
        `${month.name}: $${(grossRevenue / 100).toFixed(2)} gross, $${(refunds / 100).toFixed(2)} refunds, $${(netRevenue / 100).toFixed(2)} net (${transactionCount} charges)\n`,
      )
    } catch (error) {
      console.error(`Error fetching ${month.name}:`, error)
    }
  }

  // Print summary
  console.log('='.repeat(70))
  console.log('Summary')
  console.log('='.repeat(70))

  const totalGross = results.reduce((sum, r) => sum + r.grossRevenue, 0)
  const totalFees = results.reduce((sum, r) => sum + r.fees, 0)
  const totalRefunds = results.reduce((sum, r) => sum + r.refunds, 0)
  const totalNet = results.reduce((sum, r) => sum + r.netRevenue, 0)
  const totalCharges = results.reduce((sum, r) => sum + r.transactionCount, 0)

  console.log(
    `${'Month'.padEnd(18)} ${'Gross'.padStart(12)} ${'Refunds'.padStart(12)} ${'Net'.padStart(12)} ${'Charges'.padStart(10)}`,
  )
  console.log('-'.repeat(70))

  for (const result of results) {
    console.log(
      `${result.month.padEnd(18)} $${(result.grossRevenue / 100).toFixed(2).padStart(11)} $${(result.refunds / 100).toFixed(2).padStart(11)} $${(result.netRevenue / 100).toFixed(2).padStart(11)} ${result.transactionCount.toString().padStart(10)}`,
    )
  }

  console.log('-'.repeat(70))
  console.log(
    `${'Total'.padEnd(18)} $${(totalGross / 100).toFixed(2).padStart(11)} $${(totalRefunds / 100).toFixed(2).padStart(11)} $${(totalNet / 100).toFixed(2).padStart(11)} ${totalCharges.toString().padStart(10)}`,
  )
  if (totalFees > 0) {
    console.log(`\nStripe fees: $${(totalFees / 100).toFixed(2)}`)
  }
}

// Run the script
fetchMonthlyRevenue()
