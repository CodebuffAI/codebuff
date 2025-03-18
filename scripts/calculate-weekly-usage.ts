import { sql } from 'drizzle-orm'
import db from 'common/db'
import * as schema from 'common/db/schema'

async function calculateWeeklyUsage() {
  console.log('Calculating credit usage in the last 7 days (active subscribers only)...\n')

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  try {
    // Get total credits used across all users with active subscriptions
    const totalResult = await db
      .select({
        totalCredits: sql<string>`SUM(${schema.message.credits})`,
      })
      .from(schema.message)
      .leftJoin(schema.user, sql`${schema.message.user_id} = ${schema.user.id}`)
      .where(
        sql`${schema.message.finished_at} >= ${sevenDaysAgo}
        AND ${schema.user.subscription_active} = true`
      )

    const totalCredits = parseInt(totalResult[0]?.totalCredits || '0')
    console.log(`\nTotal credits used in last 7 days: ${totalCredits.toLocaleString()}`)

    // Get credits used per user with active subscription
    const userResults = await db
      .select({
        userId: schema.message.user_id,
        email: schema.user.email,
        userCredits: sql<string>`SUM(${schema.message.credits})`,
      })
      .from(schema.message)
      .leftJoin(schema.user, sql`${schema.message.user_id} = ${schema.user.id}`)
      .where(
        sql`${schema.message.finished_at} >= ${sevenDaysAgo}
        AND ${schema.user.subscription_active} = true`
      )
      .groupBy(schema.message.user_id, schema.user.email)
      .orderBy(sql`SUM(${schema.message.credits})` as any, 'desc' as any)

    console.log('\nUsage by active subscribers:')
    for (const result of userResults) {
      const credits = parseInt(result.userCredits)
      const user = result.email || result.userId || 'Anonymous'
      console.log(`${user}: ${credits.toLocaleString()} credits`)
    }

    // Get credits used per day for active subscribers
    const dailyResults = await db
      .select({
        date: sql<string>`DATE(${schema.message.finished_at})`,
        dailyCredits: sql<string>`SUM(${schema.message.credits})`,
      })
      .from(schema.message)
      .leftJoin(schema.user, sql`${schema.message.user_id} = ${schema.user.id}`)
      .where(
        sql`${schema.message.finished_at} >= ${sevenDaysAgo}
        AND ${schema.user.subscription_active} = true`
      )
      .groupBy(sql`DATE(${schema.message.finished_at})`)
      .orderBy(sql`DATE(${schema.message.finished_at})` as any)

    console.log('\nDaily usage (active subscribers only):')
    for (const result of dailyResults) {
      const credits = parseInt(result.dailyCredits)
      console.log(`${result.date}: ${credits.toLocaleString()} credits`)
    }

  } catch (error) {
    console.error('Error calculating weekly usage:', error)
  }
}

// Run the script
calculateWeeklyUsage()