/**
 * One-off: referral pipeline health. Counts referral rows by program +
 * status, recent rows, and qualification stats. Read-only.
 *
 * usage:
 *   infisical run --env=prod --silent -- bun scripts/referral-health.ts
 */

import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { sql, desc, gte } from 'drizzle-orm'

async function main() {
  console.log('=== referral rows by (program, status) ===')
  const byProg = await db
    .select({
      program: schema.referral.program,
      status: schema.referral.status,
      n: sql<number>`count(*)::int`,
      qualified: sql<number>`count(${schema.referral.qualified_at})::int`,
    })
    .from(schema.referral)
    .groupBy(schema.referral.program, schema.referral.status)
    .orderBy(schema.referral.program, schema.referral.status)
  console.table(byProg)

  console.log('\n=== referral rows created in the last 14 days, by day ===')
  const recent = await db
    .select({
      day: sql<string>`date_trunc('day', ${schema.referral.created_at})::date`,
      program: schema.referral.program,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.referral)
    .where(gte(schema.referral.created_at, sql`now() - interval '14 days'`))
    .groupBy(
      sql`date_trunc('day', ${schema.referral.created_at})`,
      schema.referral.program,
    )
    .orderBy(sql`date_trunc('day', ${schema.referral.created_at}) desc`)
  console.table(recent)

  console.log('\n=== 10 most recent referral rows ===')
  const last = await db
    .select()
    .from(schema.referral)
    .orderBy(desc(schema.referral.created_at))
    .limit(10)
  for (const r of last) console.log(r)

  console.log('\n=== referral_qualification: count by reason (last 14d checked) ===')
  const quals = await db
    .select({
      reason: schema.referralQualification.reason,
      qualified: schema.referralQualification.qualified,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.referralQualification)
    .where(gte(schema.referralQualification.checked_at, sql`now() - interval '14 days'`))
    .groupBy(schema.referralQualification.reason, schema.referralQualification.qualified)
    .orderBy(sql`count(*) desc`)
  console.table(quals)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
