import { db } from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { sql } from 'drizzle-orm'

async function topFreebuffUsers() {
  const hoursBack = parseInt(process.argv[2] || '72')
  const limit = parseInt(process.argv[3] || '200')
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000)

  console.log(`\nTop ${limit} Freebuff-only users by message count (last ${hoursBack} hours)`)
  console.log(`Since: ${cutoff.toISOString()}`)
  console.log('Excluding users with any base2 or base2-max messages in this period')
  console.log('─'.repeat(90))

  // Count messages per user where the agent is base2-free
  const results = await db
    .select({
      userId: schema.message.user_id,
      email: schema.user.email,
      messageCount: sql<string>`COUNT(*)`,
      totalCredits: sql<string>`COALESCE(SUM(${schema.message.credits}), 0)`,
      totalCost: sql<string>`COALESCE(SUM(${schema.message.cost}), 0)`,
      lastMessage: sql<string>`MAX(${schema.message.finished_at})`,
    })
    .from(schema.message)
    .leftJoin(schema.user, sql`${schema.message.user_id} = ${schema.user.id}`)
    .where(
      sql`${schema.message.finished_at} >= ${cutoff.toISOString()}
        AND ${schema.message.agent_id} = 'base2-free'
        AND ${schema.message.user_id} NOT IN (
          SELECT ${schema.message.user_id}
          FROM ${schema.message}
          WHERE ${schema.message.agent_id} IN ('base2', 'base2-max')
            AND ${schema.message.finished_at} >= ${cutoff.toISOString()}
        )`,
    )
    .groupBy(schema.message.user_id, schema.user.email)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit)

  if (results.length === 0) {
    console.log('\nNo Freebuff (base2-free) messages found in this time range.')
    return
  }

  // Print header
  console.log(
    `\n${'#'.padStart(4)}  ${'Email'.padEnd(40)} ${'Messages'.padStart(10)} ${'Credits'.padStart(10)} ${'Cost'.padStart(10)} ${'Last Active'.padStart(20)}`,
  )
  console.log('─'.repeat(100))

  let totalMessages = 0
  let totalCost = 0

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const msgCount = parseInt(r.messageCount)
    const cost = parseFloat(r.totalCost)
    const credits = parseInt(r.totalCredits)
    totalMessages += msgCount
    totalCost += cost

    const emailDisplay = r.email
      ? r.email.length > 38
        ? r.email.slice(0, 35) + '...'
        : r.email
      : r.userId ?? 'unknown'

    const lastActive = r.lastMessage
      ? new Date(r.lastMessage).toISOString().replace('T', ' ').slice(0, 16)
      : 'N/A'

    console.log(
      `${String(i + 1).padStart(4)}  ${emailDisplay.padEnd(40)} ${msgCount.toLocaleString().padStart(10)} ${credits.toLocaleString().padStart(10)} ${('$' + cost.toFixed(2)).padStart(10)} ${lastActive.padStart(20)}`,
    )
  }

  console.log('─'.repeat(100))
  console.log(
    `\nTotal: ${results.length} users, ${totalMessages.toLocaleString()} messages, $${totalCost.toFixed(2)} cost`,
  )

  const highUsageEmails = results
    .filter((r) => parseInt(r.messageCount) >= 50 && r.email)
    .map((r) => r.email)

  if (highUsageEmails.length > 0) {
    console.log(`\n── Users with ≥50 messages (${highUsageEmails.length}) ──`)
    console.log(highUsageEmails.join(', '))
  } else {
    console.log('\nNo users with ≥50 messages.')
  }
}

topFreebuffUsers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
