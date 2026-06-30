/**
 * One-time remediation: backfill `referral_v2.referred_github_user_id` for rows
 * that were left NULL even though the referred user has a linked GitHub account.
 *
 * Root cause: the id is only backfilled on the NextAuth `linkAccount` web event
 * (packages/auth/.../create-auth-options.ts). GitHub links via other paths (or a
 * silent fire-and-forget failure) leave the row's id NULL forever, so the
 * derived qualification join in getReferralStats silently drops the referral.
 *
 * Uses linkReferralV2GithubId, which is burn-once-safe: it only fills a NULL id
 * and skips when another referral already holds that GitHub identity. Idempotent.
 * When a referred user has multiple linked GitHub accounts, prefer the one that
 * already has a referral_qualification row (the identity we fetched facts for);
 * otherwise the first.
 *
 * usage:
 *   infisical run --env=prod --silent -- bun scripts/backfill-referral-v2-github-ids.ts          # dry-run
 *   infisical run --env=prod --silent -- bun scripts/backfill-referral-v2-github-ids.ts --apply
 */
import { getReferralStats, linkReferralV2GithubId } from '@codebuff/billing'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, eq, isNull, sql } from 'drizzle-orm'

async function main() {
  const apply = process.argv.includes('--apply')

  // Rows missing a github id but whose referred user has a github account linked.
  const stuck = await db
    .select({
      referredId: schema.referralV2.referred_id,
      referrerId: schema.referralV2.referrer_id,
      activatedAt: schema.referralV2.activated_at,
    })
    .from(schema.referralV2)
    .where(
      and(
        isNull(schema.referralV2.referred_github_user_id),
        isNull(schema.referralV2.revoked_at),
      ),
    )

  let candidates = 0
  let updated = 0
  let skippedNoGithub = 0
  let skippedHeld = 0
  const affectedReferrers = new Set<string>()

  for (const row of stuck) {
    // The referred user's github account ids, preferring one with cached facts.
    const githubs = await db
      .select({ pid: schema.account.providerAccountId })
      .from(schema.account)
      .where(
        and(
          eq(schema.account.userId, row.referredId),
          eq(schema.account.provider, 'github'),
        ),
      )
    if (githubs.length === 0) {
      skippedNoGithub++
      continue
    }

    // Prefer a github that (a) has a qualification row and (b) isn't already held
    // by another referral_v2 row (burn-once).
    let chosen: string | null = null
    for (const g of githubs) {
      const [held] = await db
        .select({ r: schema.referralV2.referred_id })
        .from(schema.referralV2)
        .where(eq(schema.referralV2.referred_github_user_id, g.pid))
        .limit(1)
      if (held) continue
      const [q] = await db
        .select({ g: schema.referralQualification.github_user_id })
        .from(schema.referralQualification)
        .where(eq(schema.referralQualification.github_user_id, g.pid))
        .limit(1)
      // Prefer one with a qualification row; otherwise remember the first free one.
      if (q) {
        chosen = g.pid
        break
      }
      if (!chosen) chosen = g.pid
    }
    if (!chosen) {
      skippedHeld++
      continue
    }

    candidates++
    affectedReferrers.add(row.referrerId)
    console.log(
      `${apply ? 'SET' : 'WOULD SET'} referred=${row.referredId} github=${chosen} (referrer=${row.referrerId}, activated=${row.activatedAt ? 'yes' : 'no'})`,
    )
    if (apply) {
      await linkReferralV2GithubId({
        referredId: row.referredId,
        githubUserId: chosen,
      })
      const after = await db
        .select({ g: schema.referralV2.referred_github_user_id })
        .from(schema.referralV2)
        .where(eq(schema.referralV2.referred_id, row.referredId))
        .limit(1)
      if (after[0]?.g === chosen) updated++
    }
  }

  console.log('\n=== SUMMARY ===')
  console.log({
    stuckRowsExamined: stuck.length,
    candidates,
    skippedNoGithub,
    skippedHeldElsewhere: skippedHeld,
    applied: apply ? updated : '(dry-run)',
    distinctReferrersTouched: affectedReferrers.size,
  })

  // Show the entitlement impact for the touched referrers.
  if (apply) {
    let gained = 0
    for (const referrerId of affectedReferrers) {
      const stats = await getReferralStats({ referrerId })
      if (stats.fullQualified + stats.limitedQualified > 0) gained++
    }
    console.log(
      `referrers now with >=1 qualified referral: ${gained}/${affectedReferrers.size}`,
    )
  }

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
