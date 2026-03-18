import { db } from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'

async function queryMinimaxCacheStats() {
  console.log('Querying minimax/minimax-m2.5 usage (last 19 hours)...\n')

  // 1. Overall stats
  const overallResult = await db.execute(sql`
    SELECT
      COUNT(*) AS total_requests,
      ROUND(AVG(input_tokens)) AS avg_input_tokens,
      ROUND(AVG(output_tokens)) AS avg_output_tokens,
      ROUND(
        CASE
          WHEN SUM(input_tokens) > 0
          THEN SUM(cache_read_input_tokens)::numeric / SUM(input_tokens) * 100
          ELSE 0
        END, 1
      ) AS overall_cache_rate_pct,
      COUNT(DISTINCT client_id) AS unique_clients
    FROM message
    WHERE finished_at >= NOW() - INTERVAL '19 hours'
      AND model = 'minimax/minimax-m2.5'
  `)

  const overall = overallResult[0]
  if (!overall || Number(overall.total_requests) === 0) {
    console.log('No data found for minimax/minimax-m2.5 in the last 19 hours.')
    return
  }

  console.log('Overall Stats')
  console.log('═══════════════════════════════════════════')
  console.log(`Total requests:          ${overall.total_requests}`)
  console.log(`Unique clients:          ${overall.unique_clients}`)
  console.log(`Avg input tokens:        ${overall.avg_input_tokens}`)
  console.log(`Avg output tokens:       ${overall.avg_output_tokens}`)
  console.log(`Overall cache rate:      ${overall.overall_cache_rate_pct}%`)

  // 2. Per-client stats, ordered by lowest cache rate
  const clientResult = await db.execute(sql`
    SELECT
      client_id,
      COUNT(*) AS request_count,
      MIN(finished_at) AS first_seen,
      MAX(finished_at) AS last_seen,
      ROUND(AVG(input_tokens)) AS avg_input,
      ROUND(
        CASE
          WHEN SUM(input_tokens) > 0
          THEN SUM(cache_read_input_tokens)::numeric / SUM(input_tokens) * 100
          ELSE 0
        END, 1
      ) AS cache_rate_pct,
      SUM(cache_read_input_tokens) AS total_cache_read,
      SUM(input_tokens) AS total_input
    FROM message
    WHERE finished_at >= NOW() - INTERVAL '19 hours'
      AND model = 'minimax/minimax-m2.5'
      AND client_id IS NOT NULL
    GROUP BY client_id
    ORDER BY cache_rate_pct ASC, request_count DESC
  `)

  console.log('\n\nPer-Client Cache Rates (lowest first)')
  console.log('═══════════════════════════════════════════')

  if (clientResult.length === 0) {
    console.log('No client-level data found.')
    return
  }

  for (const row of clientResult) {
    const clientId = String(row.client_id).slice(0, 12)
    const reqs = String(row.request_count).padStart(4)
    const cacheRate = String(row.cache_rate_pct).padStart(6)
    const avgInput = String(row.avg_input).padStart(8)
    const firstSeen = row.first_seen
      ? new Date(String(row.first_seen)).toISOString().slice(0, 16)
      : 'N/A'
    const lastSeen = row.last_seen
      ? new Date(String(row.last_seen)).toISOString().slice(0, 16)
      : 'N/A'
    console.log(
      `  ${clientId}…  reqs: ${reqs}  cache: ${cacheRate}%  avg_input: ${avgInput}  range: ${firstSeen} → ${lastSeen}`,
    )
  }

  // 3. Recent requests in time order
  const recentResult = await db.execute(sql`
    SELECT
      client_id,
      finished_at,
      input_tokens,
      cache_read_input_tokens,
      COALESCE(cache_creation_input_tokens, 0) AS cache_creation_input_tokens,
      output_tokens,
      ROUND(
        CASE
          WHEN input_tokens > 0
          THEN cache_read_input_tokens::numeric / input_tokens * 100
          ELSE 0
        END, 1
      ) AS cache_rate_pct
    FROM message
    WHERE finished_at >= NOW() - INTERVAL '19 hours'
      AND model = 'minimax/minimax-m2.5'
    ORDER BY client_id, finished_at DESC
    LIMIT 100
  `)

  console.log('\n\nRecent Requests (newest first, last 100)')
  console.log('═══════════════════════════════════════════')

  for (const row of recentResult) {
    const clientId = row.client_id
      ? String(row.client_id).slice(0, 12)
      : 'unknown     '
    const time = row.finished_at
      ? new Date(String(row.finished_at)).toISOString().slice(0, 19)
      : 'N/A'
    const cacheRate = String(row.cache_rate_pct).padStart(6)
    const input = String(row.input_tokens).padStart(7)
    const cached = String(row.cache_read_input_tokens).padStart(7)
    const creation = String(row.cache_creation_input_tokens).padStart(7)
    const output = String(row.output_tokens).padStart(6)
    console.log(
      `  ${time}  ${clientId}…  cache: ${cacheRate}%  input: ${input}  cached: ${cached}  creation: ${creation}  output: ${output}`,
    )
  }
}

queryMinimaxCacheStats()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
