/**
 * Analyze failed agent runs: top error messages, timeout prevalence, and
 * duration distribution of client-side fetch idle timeouts.
 *
 * Usage:
 *   infisical run --env=prod --silent -- bun scripts/analyze-agent-run-failures.ts
 *
 * Context: the Bun-compiled CLI aborts any fetch that receives no bytes for
 * 5 minutes ("The operation timed out."). Before June 2026 the SDK dropped
 * errorMessage from FINISH reports, so most failed runs have a NULL
 * error_message — rows recorded after that fix are the reliable signal.
 */
import { db } from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'

async function main() {
  const msgs = await db.execute(sql`
    SELECT LEFT(error_message, 100) AS msg, COUNT(*) AS n, COUNT(DISTINCT user_id) AS users
    FROM agent_run
    WHERE status = 'failed'
      AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY 1 ORDER BY n DESC LIMIT 25
  `)
  console.log('Top error messages, failed runs (7d):')
  console.table(msgs)

  const timeoutsByDay = await db.execute(sql`
    SELECT DATE(created_at) AS day,
           COUNT(*) AS timeouts,
           COUNT(DISTINCT user_id) AS users
    FROM agent_run
    WHERE status = 'failed'
      AND error_message ILIKE '%timed out%'
      AND created_at > NOW() - INTERVAL '14 days'
    GROUP BY 1 ORDER BY 1
  `)
  console.log('\nTimeout errors by day (14d):')
  console.table(timeoutsByDay)

  const durations = await db.execute(sql`
    SELECT ROUND(duration_ms / 10000.0) * 10 AS duration_bucket_s, COUNT(*) AS n
    FROM agent_run
    WHERE status = 'failed'
      AND error_message ILIKE '%timed out%'
      AND created_at > NOW() - INTERVAL '14 days'
      AND duration_ms IS NOT NULL
    GROUP BY 1 ORDER BY 1
  `)
  console.log('\nDuration distribution (10s buckets) for timeout failures:')
  console.table(durations)

  const rates = await db.execute(sql`
    SELECT DATE(created_at) AS day, status, COUNT(*) AS n
    FROM agent_run
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY 1, 2 ORDER BY 1, 2
  `)
  console.log('\nRun status counts by day (7d):')
  console.table(rates)

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
