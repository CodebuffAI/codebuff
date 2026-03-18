import { db } from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'

async function queryUsageStats() {
  console.log(
    'Querying usage stats for the last 7 days (minimax-m2.5, claude-4.6-opus)...\n',
  )

  const result = await db.execute(sql`
    WITH recent AS (
      SELECT
        input_tokens,
        cache_read_input_tokens,
        COALESCE(cache_creation_input_tokens, 0) AS cache_creation_input_tokens,
        output_tokens,
        finished_at,
        client_id
      FROM message
      WHERE finished_at >= NOW() - INTERVAL '4 days'
        AND model IN ('minimax/minimax-m2.5')
    ),

    token_stats AS (
      SELECT
        ROUND(AVG(input_tokens))
          AS avg_total_input_tokens,
        ROUND(
          AVG(
            CASE
              WHEN input_tokens > 0
              THEN cache_read_input_tokens::numeric / input_tokens
              ELSE 0
            END
          ) * 100, 1
        ) AS avg_cache_rate_pct,
        ROUND(AVG(output_tokens))
          AS avg_output_tokens,
        COUNT(*) AS total_requests
      FROM recent
    ),

    client_stats AS (
      SELECT
        ROUND(AVG(cnt)) AS avg_requests_per_client,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cnt) AS median_requests_per_client,
        MAX(cnt) AS max_requests_per_client
      FROM (
        SELECT client_id, COUNT(*) AS cnt
        FROM recent
        WHERE client_id IS NOT NULL
        GROUP BY client_id
      ) per_client
    ),

    rps AS (
      SELECT
        COUNT(*) AS req_count
      FROM recent
      GROUP BY date_trunc('second', finished_at)
    ),

    rps_stats AS (
      SELECT
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY req_count) AS median_rps,
        MAX(req_count) AS peak_rps
      FROM rps
    )

    SELECT
      t.avg_total_input_tokens,
      t.avg_cache_rate_pct,
      t.avg_output_tokens,
      c.avg_requests_per_client,
      c.median_requests_per_client,
      c.max_requests_per_client,
      r.median_rps,
      r.peak_rps,
      t.total_requests
    FROM token_stats t, rps_stats r, client_stats c
  `)

  const row = result[0]
  if (!row) {
    console.log('No data found for the given filters.')
    return
  }

  console.log('Results:')
  console.log('─────────────────────────────────────────')
  console.log(`Avg total input tokens:  ${row.avg_total_input_tokens}`)
  console.log(`Avg cache rate:          ${row.avg_cache_rate_pct}%`)
  console.log(`Avg output tokens:       ${row.avg_output_tokens}`)
  console.log(`Median RPS:              ${row.median_rps}`)
  console.log(`Peak RPS:                ${row.peak_rps}`)
  console.log(`Avg requests/client:     ${row.avg_requests_per_client}`)
  console.log(`Median requests/client:  ${row.median_requests_per_client}`)
  console.log(`Max requests/client:     ${row.max_requests_per_client}`)
  console.log(`Total requests (7d):     ${row.total_requests}`)
}

queryUsageStats().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
