import { sql } from 'drizzle-orm'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'

async function calculateDAU() {
  console.log('Calculating DAU for the last 7 days...\n')

  // Get daily active users for the last 7 complete days
  const dailyStats = await db
    .select({
      date: sql<string>`DATE(${schema.message.finished_at})`,
      uniqueUsers: sql<string>`COUNT(DISTINCT COALESCE(${schema.message.user_id}, ${schema.message.fingerprint_id}))`,
    })
    .from(schema.message)
    .where(
      sql`DATE(${schema.message.finished_at}) >= CURRENT_DATE - INTERVAL '7 days' AND DATE(${schema.message.finished_at}) < CURRENT_DATE`
    )
    .groupBy(sql`DATE(${schema.message.finished_at})`)
    .orderBy(sql`DATE(${schema.message.finished_at})`)

  let totalUsers = 0
  
  // Print daily stats
  dailyStats.forEach(stat => {
    const users = parseInt(stat.uniqueUsers)
    totalUsers += users
    console.log(`${stat.date}: ${users} users`)
  })

  // Calculate and print average
  const avgUsers = Math.round(totalUsers / dailyStats.length)
  console.log(`\nAverage DAU over last ${dailyStats.length} days: ${avgUsers}`)
}

// Run the script
calculateDAU()
