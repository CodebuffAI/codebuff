import fs from 'fs'
import { stripeServer } from '../common/src/util/stripe'
import Stripe from 'stripe'
import db from '../common/src/db/index'
import * as schema from '../common/src/db/schema'
import { eq } from 'drizzle-orm'

const USAGE_PRICE_ID = process.env.STRIPE_USAGE_PRICE_ID

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

const processedPathKey = (customerId: string) => `${customerId}` // helper

async function processCustomer(entry: MigrationEntry) {
  if (!entry.stripeCustomerId) {
    console.warn(`User ${entry.userId} missing stripeCustomerId`)
    return
  }

  if (processedSubs.has(processedPathKey(entry.stripeCustomerId))) {
    return // already handled customer
  }

  // Fetch active subscriptions
  const subs = await stripeServer.subscriptions.list({
    customer: entry.stripeCustomerId,
    status: 'active',
    limit: 100,
    expand: ['data.items.data.price'],
  })

  // Try to find legacy licensed subscription
  const legacySub = subs.data.find((sub) =>
    sub.items.data.some(
      (item: Stripe.SubscriptionItem) =>
        item.price.recurring?.usage_type === 'licensed'
    )
  )

  // Cancel legacy immediately (no refund) if it exists
  if (legacySub && legacySub.status !== 'canceled') {
    await stripeServer.subscriptions.cancel(legacySub.id, {
      invoice_now: false,
      prorate: false,
    })
    console.log(`Canceled legacy sub ${legacySub.id} (no prorate).`)
  }

  // Does customer already have usage‑based sub?
  const hasUsageBasedSub = subs.data.some((sub) =>
    sub.items.data.every(
      (item: Stripe.SubscriptionItem) => item.price.id === USAGE_PRICE_ID
    )
  )

  if (!hasUsageBasedSub) {
    // Create new usage‑based subscription
    const newSub = await stripeServer.subscriptions.create({
      customer: entry.stripeCustomerId,
      items: [{ price: USAGE_PRICE_ID }],
      payment_behavior: 'default_incomplete',
      expand: ['items.data.price'],
    })
    console.log(
      `Created usage sub ${newSub.id} for customer ${entry.stripeCustomerId}`
    )
  }

  // Persist price ID to DB
  await db
    .update(schema.user)
    .set({ stripe_price_id: USAGE_PRICE_ID })
    .where(eq(schema.user.id, entry.userId))

  // Mark customer processed
  processedSubs.add(processedPathKey(entry.stripeCustomerId))
  fs.writeFileSync(
    progressPath,
    JSON.stringify(Array.from(processedSubs), null, 2)
  )
  console.log(`Processed customer ${entry.stripeCustomerId}`)
}

;(async () => {
  console.log(`Processing ${migrationData.length} migrated users...`)
  for (const entry of migrationData) {
    await processCustomer(entry)
  }
  console.log('Stripe subscription updates complete!')
})()
