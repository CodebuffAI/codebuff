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

async function processCustomer(entry: MigrationEntry) {
  if (!entry.stripeCustomerId) {
    console.warn(`User ${entry.userId} missing stripeCustomerId`)
    return
  }

  // Fetch active legacy subscription (licensed usage_type)
  const subs = await stripeServer.subscriptions.list({
    customer: entry.stripeCustomerId,
    status: 'active',
    limit: 100,
    expand: ['data.items.data.price'],
  })

  const legacySub = subs.data.find((sub) =>
    sub.items.data.some(
      (item: Stripe.SubscriptionItem) =>
        item.price.recurring?.usage_type === 'licensed'
    )
  )

  if (!legacySub) {
    console.warn(
      `No legacy subscription for customer ${entry.stripeCustomerId}`
    )
    return
  }

  if (processedSubs.has(legacySub.id)) return // already handled

  // 1) Cancel legacy subscription immediately without prorating (no refunds)
  if (legacySub.status !== 'canceled') {
    await stripeServer.subscriptions.cancel(legacySub.id, {
      invoice_now: false, // don't generate an extra invoice
      prorate: false, // NO prorations → no refund / credit
    })
    console.log(`Canceled legacy sub ${legacySub.id} immediately (no prorate).`)
  }

  // 2) Check if customer already has a usage‑based sub
  const hasUsageBasedSub = subs.data.some((sub) =>
    sub.items.data.every(
      (item: Stripe.SubscriptionItem) => item.price.id === USAGE_PRICE_ID
    )
  )

  let newSub: Stripe.Subscription | undefined
  if (!hasUsageBasedSub) {
    // Create new usage‑based subscription (price is $0 metered)
    newSub = await stripeServer.subscriptions.create({
      customer: entry.stripeCustomerId,
      items: [{ price: USAGE_PRICE_ID }],
      payment_behavior: 'default_incomplete', // avoids immediate invoice
      expand: ['items.data.price'],
    })
    console.log(
      `Created usage sub ${newSub.id} for customer ${entry.stripeCustomerId}`
    )

    // 3) Persist price_id (usage price) to DB
    await db
      .update(schema.user)
      .set({ stripe_price_id: USAGE_PRICE_ID })
      .where(eq(schema.user.id, entry.userId))

    processedSubs.add(legacySub.id)
    fs.writeFileSync(
      progressPath,
      JSON.stringify(Array.from(processedSubs), null, 2)
    )
    console.log(`Processed customer ${entry.stripeCustomerId}`)
  }
}

;(async () => {
  console.log(`Processing ${migrationData.length} migrated users...`)
  for (const entry of migrationData) {
    await processCustomer(entry)
  }
  console.log('Stripe subscription updates complete!')
})()
