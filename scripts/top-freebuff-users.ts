import { db } from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { sql } from 'drizzle-orm'

interface UserStats {
  userId: string
  email: string | null
  messageCount: number
  totalCredits: number
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  cacheHitRate: number
  daysActive: number
  avgMessagesPerDay: number
  maxMessagesInDay: number
  firstMessage: string
  lastMessage: string
  hourlyDistribution: Map<number, number>
}

async function topFreebuffUsers() {
  const hoursBack = parseInt(process.argv[2] || '168') // default 1 week
  const limit = parseInt(process.argv[3] || '50')
  const agentId = process.argv[4] || 'base2-free' // configurable agent ID
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000)
  const excludeAgents = ['base2', 'base2-max']

  console.log(`\n${'='.repeat(100)}`)
  console.log(`  TOP FREEBUFF USERS - DETAILED STATS (last ${hoursBack} hours)`)
  console.log(`  Agent: ${agentId}`)
  console.log(`  Since: ${cutoff.toISOString()}`)
  console.log(`  Excluding: ${excludeAgents.join(', ')}`)
  console.log(`${'='.repeat(100)}\n`)

  // Get all base2-free messages in the period (excluding users with base2/base2-max)
  const results = await db
    .select({
      userId: schema.message.user_id,
      email: schema.user.email,
      messageCount: sql<number>`COUNT(*)`,
      totalCredits: sql<number>`COALESCE(SUM(${schema.message.credits}), 0)`,
      totalCost: sql<number>`COALESCE(SUM(${schema.message.cost}), 0)`,
      totalInputTokens: sql<number>`COALESCE(SUM(${schema.message.input_tokens}), 0)`,
      totalOutputTokens: sql<number>`COALESCE(SUM(${schema.message.output_tokens}), 0)`,
      totalCacheReadTokens: sql<number>`COALESCE(SUM(${schema.message.cache_read_input_tokens}), 0)`,
      firstMessage: sql<string>`MIN(${schema.message.finished_at})`,
      lastMessage: sql<string>`MAX(${schema.message.finished_at})`,
    })
    .from(schema.message)
    .leftJoin(schema.user, sql`${schema.message.user_id} = ${schema.user.id}`)
    .where(
      sql`${schema.message.finished_at} >= ${cutoff.toISOString()}
        AND ${schema.message.agent_id} = ${agentId}
        AND ${schema.message.user_id} NOT IN (
          SELECT ${schema.message.user_id}
          FROM ${schema.message}
          WHERE ${schema.message.agent_id} IN (${sql.join(excludeAgents.map(a => sql`${a}`), sql`, `)})
            AND ${schema.message.finished_at} >= ${cutoff.toISOString()}
        )`,
    )
    .groupBy(schema.message.user_id, schema.user.email)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit)

  if (results.length === 0) {
    console.log(`No ${agentId} messages found in this time range.`)
    console.log('\nTip: Run with a different agent_id as the 4th argument, e.g.:')
    console.log('  bun run scripts/top-freebuff-users.ts 168 50 claude-sonnet-4-20250514')
    return
  }

  // Now run detailed queries since we have users
  const userIds = results.map(r => r.userId).filter((id): id is string => !!id)
  
  const dailyStats = await db
    .select({
      userId: schema.message.user_id,
      date: sql<string>`DATE(${schema.message.finished_at})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.message)
    .where(
      sql`${schema.message.finished_at} >= ${cutoff.toISOString()}
        AND ${schema.message.agent_id} = ${agentId}
        AND ${schema.message.user_id} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`,
    )
    .groupBy(sql`DATE(${schema.message.finished_at})`, schema.message.user_id)

  const hourlyStats = await db
    .select({
      userId: schema.message.user_id,
      hour: sql<number>`EXTRACT(HOUR FROM ${schema.message.finished_at})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.message)
    .where(
      sql`${schema.message.finished_at} >= ${cutoff.toISOString()}
        AND ${schema.message.agent_id} = ${agentId}
        AND ${schema.message.user_id} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`,
    )
    .groupBy(sql`EXTRACT(HOUR FROM ${schema.message.finished_at})`, schema.message.user_id)

  // Aggregate daily stats per user
  const dailyByUser = new Map<string, { date: string; count: number }[]>()
  for (const d of dailyStats) {
    const uid = d.userId ?? ''
    if (!dailyByUser.has(uid)) dailyByUser.set(uid, [])
    dailyByUser.get(uid)!.push({ date: d.date ?? '', count: Number(d.count) })
  }

  // Aggregate hourly stats per user
  const hourlyByUser = new Map<string, Map<number, number>>()
  for (const h of hourlyStats) {
    const hour = Number(h.hour)
    const uid = h.userId ?? ''
    if (!hourlyByUser.has(uid)) hourlyByUser.set(uid, new Map())
    const hourMap = hourlyByUser.get(uid)!
    hourMap.set(hour, (hourMap.get(hour) || 0) + Number(h.count))
  }

  // Build user stats objects
  const userStats: UserStats[] = results.map(r => {
    const uid = r.userId ?? ''
    const daysData = dailyByUser.get(uid) || []
    const hourMap = hourlyByUser.get(uid) || new Map()
    
    const daysActive = daysData.length
    const maxMessagesInDay = daysData.reduce((max, d) => Math.max(max, d.count), 0)
    const avgMessagesPerDay = daysData.length > 0 
      ? Math.round(daysData.reduce((sum, d) => sum + d.count, 0) / daysData.length)
      : 0
    
    const totalTokens = Number(r.totalInputTokens) + Number(r.totalOutputTokens)
    const cacheReadTokens = Number(r.totalCacheReadTokens)
    const cacheHitRate = totalTokens > 0 ? (cacheReadTokens / totalTokens) * 100 : 0

    return {
      userId: r.userId ?? 'unknown',
      email: r.email,
      messageCount: Number(r.messageCount),
      totalCredits: Number(r.totalCredits),
      totalCost: Number(r.totalCost),
      totalInputTokens: Number(r.totalInputTokens),
      totalOutputTokens: Number(r.totalOutputTokens),
      totalCacheReadTokens: cacheReadTokens,
      cacheHitRate: Math.round(cacheHitRate * 10) / 10,
      daysActive,
      avgMessagesPerDay,
      maxMessagesInDay,
      firstMessage: r.firstMessage ?? '',
      lastMessage: r.lastMessage ?? '',
      hourlyDistribution: hourMap,
    }
  })

  // Print summary table
  console.log(`${'#'.padStart(3)}  ${'Email'.padEnd(35)} ${'Msgs'.padStart(7)} ${'Days'.padStart(5)} ${'Avg/Day'.padStart(8)} ${'Max/Day'.padStart(8)} ${'InTok'.padStart(9)} ${'OutTok'.padStart(9)} ${'Cache%'.padStart(7)} ${'Credits'.padStart(9)}`)
  console.log(`${'='.repeat(105)}`)

  let totalMessages = 0
  let totalCredits = 0
  let totalCost = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0

  for (let i = 0; i < userStats.length; i++) {
    const u = userStats[i]
    totalMessages += u.messageCount
    totalCredits += u.totalCredits
    totalCost += u.totalCost
    totalInputTokens += u.totalInputTokens
    totalOutputTokens += u.totalOutputTokens

    const emailDisplay = (u.email ?? u.userId.slice(0, 8) + '...')
      .slice(0, 33)

    console.log(
      `${String(i + 1).padStart(3)}  ${emailDisplay.padEnd(35)} ${u.messageCount.toLocaleString().padStart(7)} ${u.daysActive.toString().padStart(5)} ${u.avgMessagesPerDay.toString().padStart(8)} ${u.maxMessagesInDay.toString().padStart(8)} ${u.totalInputTokens.toLocaleString().padStart(9)} ${u.totalOutputTokens.toLocaleString().padStart(9)} ${(u.cacheHitRate + '%').padStart(7)} ${u.totalCredits.toLocaleString().padStart(9)}`,
    )
  }

  console.log(`${'='.repeat(105)}`)
  console.log(
    `\nTotal: ${userStats.length} users, ${totalMessages.toLocaleString()} messages, ${totalCredits.toLocaleString()} credits, $${totalCost.toFixed(2)}`,
  )
  console.log(`Tokens: ${totalInputTokens.toLocaleString()} in / ${totalOutputTokens.toLocaleString()} out\n`)

  // Time distribution analysis - top 10 users by message count
  console.log(`${'='.repeat(100)}`)
  console.log(`  TIME DISTRIBUTION ANALYSIS (Top 10 users)`)
  console.log(`${'='.repeat(100)}\n`)

  const top10 = userStats.slice(0, 10)
  
  // Aggregate hourly distribution across top users
  const overallHourly = new Map<number, number>()
  for (const u of top10) {
    for (const [hour, count] of u.hourlyDistribution) {
      overallHourly.set(hour, (overallHourly.get(hour) || 0) + count)
    }
  }

  // Sort by hour and display
  const sortedHours = [...overallHourly.entries()].sort((a, b) => a[0] - b[0])
  const maxHourCount = Math.max(...sortedHours.map(([_, c]) => c))

  console.log('Hourly activity distribution (all top 10 users combined):')
  console.log('')
  
  for (const [hour, count] of sortedHours) {
    const bar = '='.repeat(Math.round((count / maxHourCount) * 40))
    const hourStr = hour.toString().padStart(2, '0') + ':00'
    console.log(`  ${hourStr}  ${count.toString().padStart(5)} ${bar}`)
  }

  // Day of week analysis
  const dayOfWeekStats = await db
    .select({
      dayOfWeek: sql<number>`EXTRACT(DOW FROM ${schema.message.finished_at})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.message)
    .where(
      sql`${schema.message.finished_at} >= ${cutoff.toISOString()}
        AND ${schema.message.agent_id} = ${agentId}
        AND ${schema.message.user_id} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`,
    )
    .groupBy(sql`EXTRACT(DOW FROM ${schema.message.finished_at})`)

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  console.log('\nDay of week distribution:')
  const sortedDays = dayOfWeekStats.sort((a, b) => Number(a.dayOfWeek) - Number(b.dayOfWeek))
  const maxDayCount = Math.max(...sortedDays.map(d => Number(d.count)))

  for (const d of sortedDays) {
    const dayName = dayNames[Number(d.dayOfWeek)]
    const count = Number(d.count)
    const bar = '='.repeat(Math.round((count / maxDayCount) * 30))
    console.log(`  ${dayName}  ${count.toString().padStart(5)} ${bar}`)
  }

  // Active days histogram
  console.log('\nDays active histogram:')
  const daysActiveCounts = new Map<number, number>()
  for (const u of userStats) {
    daysActiveCounts.set(u.daysActive, (daysActiveCounts.get(u.daysActive) || 0) + 1)
  }
  const sortedDaysActive = [...daysActiveCounts.entries()].sort((a, b) => a[0] - b[0])
  const maxActiveUsers = Math.max(...sortedDaysActive.map(([_, c]) => c))

  for (const [days, count] of sortedDaysActive) {
    const bar = '='.repeat(Math.round((count / maxActiveUsers) * 40))
    console.log(`  ${days.toString().padStart(2)} days  ${count.toString().padStart(3)} users ${bar}`)
  }

  // Session stats - users with highest avg messages per active day
  console.log('\nTop 10 users by avg messages per active day:')
  console.log(`${'Email'.padEnd(40)} ${'Days Active'.padStart(12)} ${'Avg/Day'.padStart(10)} ${'Max/Day'.padStart(10)}`)
  console.log(`${'='.repeat(75)}`)

  const byAvgPerDay = [...userStats]
    .filter(u => u.daysActive > 0)
    .sort((a, b) => b.avgMessagesPerDay - a.avgMessagesPerDay)
    .slice(0, 10)

  for (const u of byAvgPerDay) {
    const emailDisplay = (u.email ?? u.userId.slice(0, 8) + '...')
      .slice(0, 38)
    
    console.log(
      `${emailDisplay.padEnd(40)} ${u.daysActive.toString().padStart(12)} ${u.avgMessagesPerDay.toString().padStart(10)} ${u.maxMessagesInDay.toString().padStart(10)}`,
    )
  }

  console.log('\n')
}

topFreebuffUsers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
