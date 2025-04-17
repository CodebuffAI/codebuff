# Stripe Invoice Reconciliation Plan

## Current System Overview

We have two parallel tracking systems:
1. **Local Credit System**:
   - Tracks credits in `creditGrants` table
   - Records message costs in `message` table with both raw cost and credits used
   - Records sync failures in `syncFailures` table
   - Sends metered events to Stripe asynchronously

2. **Stripe Metered Events**:
   - Records monetary usage via `billing.meterEvents.create`
   - Used for financial tracking
   - Generates invoices based on metered events

## Proposed Invoice Reconciliation

async function handleInvoiceCreated(invoice: Stripe.Invoice) {
  const { customer, period_start, period_end } = invoice
  
  const user = await db.query.user.findFirst({
    where: eq(schema.user.stripe_customer_id, customer)
  })
  if (!user) {
    logger.error({ customer }, 'No user found for Stripe customer')
    return
  }

  const meteredItems = invoice.lines.data.filter(
    line => line.type === 'metered'
  )
  const stripeTotal = meteredItems.reduce(
    (sum, item) => sum + item.amount,
    0
  )

  const localMessages = await db.query.message.findMany({
    where: and(
      eq(schema.message.user_id, user.id),
      gte(schema.message.finished_at, new Date(period_start * 1000)),
      lt(schema.message.finished_at, new Date(period_end * 1000))
    ),
    columns: {
      id: true,
      cost: true,
      finished_at: true,
    },
  })

  const localTotal = localMessages.reduce(
    (sum, msg) => sum + Math.round(parseFloat(msg.cost) * 100 * (1 + PROFIT_MARGIN)),
    0
  )

  const discrepancy = Math.abs(stripeTotal - localTotal)
  const discrepancyThreshold = 100 
  
  if (discrepancy > discrepancyThreshold) {
    logger.error({
      invoiceId: invoice.id,
      userId: user.id,
      stripeTotal,
      localTotal,
      discrepancy,
      messageCount: localMessages.length,
      periodStart: period_start,
      periodEnd: period_end,
    }, 'Large discrepancy found in invoice reconciliation')

    const failedSyncs = await db.query.syncFailures.findMany({
      where: and(
        eq(schema.syncFailures.user_id, user.id),
        gte(schema.syncFailures.last_attempt_at, new Date(period_start * 1000)),
        lt(schema.syncFailures.last_attempt_at, new Date(period_end * 1000))
      )
    })

    if (failedSyncs.length > 0) {
      for (const failure of failedSyncs) {
        try {
          const message = await db.query.message.findFirst({
            where: eq(schema.message.id, failure.message_id)
          })
          if (!message) continue

          await syncMessageToStripe({
            messageId: message.id,
            userId: user.id,
            monetaryCostInCents: Math.round(parseFloat(message.cost) * 100 * (1 + PROFIT_MARGIN)),
            finishedAt: message.finished_at
          })

          await db.delete(schema.syncFailures)
            .where(eq(schema.syncFailures.message_id, message.id))

        } catch (error) {
          logger.error(
            { error, messageId: failure.message_id },
            'Failed to sync message during invoice reconciliation'
          )
        }
      }
    }

    await db.insert(schema.invoiceReconciliation).values({
      invoice_id: invoice.id,
      user_id: user.id,
      stripe_total: stripeTotal,
      local_total: localTotal,
      discrepancy,
      message_count: localMessages.length,
      failed_syncs_count: failedSyncs.length,
      period_start: new Date(period_start * 1000),
      period_end: new Date(period_end * 1000),
    })
  }
}

export const invoiceReconciliation = pgTable('invoice_reconciliation', {
  invoice_id: text('invoice_id').notNull(),
  user_id: text('user_id').notNull(),
  stripe_total: integer('stripe_total').notNull(),
  local_total: integer('local_total').notNull(),
  discrepancy: integer('discrepancy').notNull(),
  message_count: integer('message_count').notNull(),
  failed_syncs_count: integer('failed_syncs_count').notNull(),
  period_start: timestamp('period_start').notNull(),
  period_end: timestamp('period_end').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})