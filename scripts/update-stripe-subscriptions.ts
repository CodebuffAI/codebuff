import fs from 'fs'
import { stripeServer } from '../common/src/util/stripe'
import { env } from '../backend/src/env.mjs'
import Stripe from 'stripe'

const USAGE_PRICE_ID = env.STRIPE_USAGE_PRICE_ID

if (!USAGE_PRICE_ID) {
  console.error('Missing STRIPE_USAGE_PRICE_ID in env')
  process.exit(1)
}

interface MigrationEntry {
  userId: string
  stripeCustomerId: string | null
}

const migrationData: MigrationEntry[] = JSON.parse(
  fs.readFileSync('credit-migration-data.json', 'utf-8')
)

const progressPath = 'update-stripe-progress.json'
let processedSubs = new Set<string>()
if (fs.existsSync(progressPath)) {
  processedSubs = new Set(JSON.parse(fs.readFileSync(progressPath, 'utf-8')))
}

async function processCustomer(entry: MigrationEntry) {
  if (!entry.stripeCustomerId) {
    console.warn(`User ${entry.userId} missing stripeCustomerId`)
    return
  }

  const subs = await stripeServer.subscriptions.list({
    customer: entry.stripeCustomerId,
    status: 'active',
    limit: 1,
    expand: ['data.items.data.price'],
  })

  const sub = subs.data[0]
  if (!sub) {
    console.warn(`No active subscription for customer ${entry.stripeCustomerId}`)
    return
  }

  if (processedSubs.has(sub.id)) return // already handled

  // Cancel at period end if not already set
  if (!sub.cancel_at_period_end) {
    await stripeServer.subscriptions.update(sub.id, {
      cancel_at_period_end: true,
    })
  }

  // Check if usage price already attached
  const hasUsageItem = sub.items.data.some(
    (item: Stripe.SubscriptionItem) => item.price.id === USAGE_PRICE_ID
  )

  if (!hasUsageItem) {
    await stripeServer.subscriptionItems.create({
      subscription: sub.id,
      price: USAGE_PRICE_ID,
    })
  }

  processedSubs.add(sub.id)
  fs.writeFileSync(progressPath, JSON.stringify(Array.from(processedSubs), null, 2))
  console.log(`Updated subscription ${sub.id} for customer ${entry.stripeCustomerId}`)
}

;(async () => {
  console.log(`Processing ${migrationData.length} migrated users...`)
  for (const entry of migrationData) {
    await processCustomer(entry)
  }
  console.log('Stripe subscription updates complete!')
})()
