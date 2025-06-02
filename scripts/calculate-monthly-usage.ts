import db from 'common/db'
import * as schema from 'common/db/schema'
import { and, gte, lt, sql } from 'drizzle-orm'
import { logger } from 'common/util/logger'

async function calculateMonthlyUsage(month: string) {
  try {
    // Parse the month string (format: YYYY-MM)
    const [year, monthNum] = month.split('-').map(Number)
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      throw new Error('Invalid month format. Please use YYYY-MM (e.g. 2025-04)')
    }

    // Calculate start and end dates
    const startDate = new Date(year, monthNum - 1, 1) // Month is 0-based in JS Date
    const endDate = new Date(year, monthNum, 1) // First day of next month

    // Query to get total credits and breakdown by user
    const results = await db
      .select({
        totalCredits: sql<number>`SUM(${schema.message.credits})`,
        userCount: sql<number>`COUNT(DISTINCT ${schema.message.user_id})`,
        messageCount: sql<number>`COUNT(*)`,
      })
      .from(schema.message)
      .where(
        and(
          gte(schema.message.finished_at, startDate),
          lt(schema.message.finished_at, endDate)
        )
      )

    // Get per-user breakdown
    const userBreakdown = await db
      .select({
        userId: schema.message.user_id,
        userCredits: sql<number>`SUM(${schema.message.credits})`,
        userMessages: sql<number>`COUNT(*)`,
      })
      .from(schema.message)
      .where(
        and(
          gte(schema.message.finished_at, startDate),
          lt(schema.message.finished_at, endDate)
        )
      )
      .groupBy(schema.message.user_id)
      .orderBy(sql`SUM(${schema.message.credits}) DESC`)
      .limit(10) // Show top 10 users by credit usage

    // Print results
    console.log(`\nCredit Usage Summary for ${month}:`)
    console.log('=====================================')
    console.log(`Total Credits Used: ${results[0].totalCredits?.toLocaleString() ?? 0}`)
    console.log(`Total Users: ${results[0].userCount}`)
    console.log(`Total Messages: ${results[0].messageCount}`)
    
    console.log('\nTop 10 Users by Credit Usage:')
    console.log('============================')
    userBreakdown.forEach((user, index) => {
      console.log(`${index + 1}. User ${user.userId}:`)
      console.log(`   Credits: ${user.userCredits?.toLocaleString() ?? 0}`)
      console.log(`   Messages: ${user.userMessages}`)
    })

  } catch (error) {
    logger.error({ error }, 'Error calculating monthly usage')
    throw error
  }
}

// Get month from command line argument or default to current month
const month = process.argv[2] || new Date().toISOString().split('-')[0] + '-' + new Date().toISOString().split('-')[1]

// Run the calculation
calculateMonthlyUsage(month)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to calculate usage:', error)
    process.exit(1)
  })