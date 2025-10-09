import { db } from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { getErrorObject } from '@codebuff/common/util/error'
import { and, gte, lt, sql } from 'drizzle-orm'

async function calculateMonthlyUsage(month: string) {
  try {
    // Parse the month string (format: YYYY-MM)
    const [year, monthNum] = month.split('-').map(Number)
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      throw new Error('Invalid month format. Please use YYYY-MM (e.g. 2025-04)')
    }

    // Calculate start and end dates in local timezone
    // Using local timezone ensures we get the full month in the user's timezone
    const startDate = new Date(year, monthNum - 1, 1) // Month is 0-based in JS Date
    const endDate = new Date(year, monthNum, 1) // First day of next month

    console.log(
      `Calculating usage for ${month} (${startDate.toLocaleDateString()} to ${new Date(endDate.getTime() - 1).toLocaleDateString()} local time)`,
    )

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
          lt(schema.message.finished_at, endDate),
        ),
      )

    // Get per-user breakdown with user details
    const userBreakdown = await db
      .select({
        userId: schema.message.user_id,
        userName: schema.user.name,
        userEmail: schema.user.email,
        userHandle: schema.user.handle,
        userCredits: sql<number>`SUM(${schema.message.credits})`,
        userMessages: sql<number>`COUNT(*)`,
      })
      .from(schema.message)
      .leftJoin(schema.user, sql`${schema.message.user_id} = ${schema.user.id}`)
      .where(
        and(
          gte(schema.message.finished_at, startDate),
          lt(schema.message.finished_at, endDate),
        ),
      )
      .groupBy(
        schema.message.user_id,
        schema.user.name,
        schema.user.email,
        schema.user.handle,
      )
      .orderBy(sql`SUM(${schema.message.credits}) DESC`)
      .limit(10) // Show top 10 users by credit usage

    // Print results
    console.log(`\nCredit Usage Summary for ${month}:`)
    console.log('=====================================')
    console.log(
      `Total Credits Used: ${results[0].totalCredits?.toLocaleString() ?? 0}`,
    )
    console.log(`Total Users: ${results[0].userCount}`)
    console.log(`Total Messages: ${results[0].messageCount}`)

    console.log('\nTop 10 Users by Credit Usage:')
    console.log('============================')
    userBreakdown.forEach((user, index) => {
      const displayName =
        user.userName || user.userHandle || user.userEmail || 'Unknown'
      console.log(`${index + 1}. ${displayName} (${user.userId}):`)
      console.log(`   Credits: ${user.userCredits?.toLocaleString() ?? 0}`)
      console.log(`   Messages: ${user.userMessages}`)
      if (user.userEmail) {
        console.log(`   Email: ${user.userEmail}`)
      }
      if (user.userHandle) {
        console.log(`   Handle: @${user.userHandle}`)
      }
    })
  } catch (error) {
    console.error(
      { error: getErrorObject(error) },
      'Error calculating monthly usage',
    )
    throw error
  }
}

// Get month from command line argument or default to current month in local timezone
const getCurrentMonthLocal = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth().toString().padStart(2, '0') // getMonth() is 0-based
  return `${year}-${month}`
}

const month = process.argv[2] || getCurrentMonthLocal()

// Run the calculation
calculateMonthlyUsage(month)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to calculate usage:', error)
    process.exit(1)
  })
