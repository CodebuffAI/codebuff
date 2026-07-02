/**
 * One-off: diagnose why a user does/doesn't have GLM referral access, looked up
 * by Discord id. Dumps the user, their referral_v2 rows in BOTH directions
 * (referrals they made + their own referral / self-bump), each counterpart's
 * activation tier + derived GitHub age, and the live computed entitlement.
 * Read-only.
 *
 * usage:
 *   infisical run --env=prod --silent -- bun scripts/diagnose-glm-referral.ts <discord_id>
 */
import { MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL } from '@codebuff/common/constants/freebuff-referral-tiers'
import {
  getGlmReferralEntitlement,
  getReferralStats,
} from '@codebuff/billing'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq, or, sql } from 'drizzle-orm'

async function githubFor(userId: string) {
  const [acct] = await db
    .select({ id: schema.account.providerAccountId })
    .from(schema.account)
    .where(
      sql`${schema.account.userId} = ${userId} AND ${schema.account.provider} = 'github'`,
    )
    .limit(1)
  return acct?.id ?? null
}

async function dumpRow(label: string, r: typeof schema.referralV2.$inferSelect) {
  // Resolve the github id the same way the live read does: stored id, else the
  // referred user's linked account (so NULL-id rows aren't shown as UNKNOWN).
  const storedId = r.referred_github_user_id
  const resolvedId = storedId ?? (await githubFor(r.referred_id))
  const idSource = storedId ? 'stored' : resolvedId ? 'account-fallback' : 'none'

  let ageMonths: number | null = null
  let qualified = false
  if (resolvedId) {
    const [q] = await db
      .select({ createdAt: schema.referralQualification.github_account_created_at })
      .from(schema.referralQualification)
      .where(eq(schema.referralQualification.github_user_id, resolvedId))
      .limit(1)
    if (q?.createdAt) {
      ageMonths =
        (Date.now() - q.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
      qualified = ageMonths >= MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL
    }
  }
  console.log(`  [${label}] referred=${r.referred_id} referrer=${r.referrer_id}`)
  console.log(
    `      github_id=${resolvedId ?? 'NULL'} (${idSource}) activated_at=${r.activated_at?.toISOString() ?? 'NULL'} tier=${r.activation_access_tier ?? 'NULL'} revoked_at=${r.revoked_at?.toISOString() ?? 'null'}`,
  )
  console.log(
    `      github_age_months=${ageMonths === null ? 'UNKNOWN (no qualification row)' : ageMonths.toFixed(1)} age_qualified(>=${MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL}mo)=${qualified}`,
  )
  // Attribution evidence (null on pre-signal rows). Overlap with the referrer
  // is NOT a verdict — it's also what an in-person referral looks like.
  const overlaps: string[] = []
  if (r.referrer_ip_overlap) overlaps.push('same-ip-as-referrer')
  if (r.referrer_device_overlap) overlaps.push('same-browser-as-referrer')
  console.log(
    `      ip_hash=${r.referred_ip_hash ? r.referred_ip_hash.slice(0, 12) + '…' : 'null'} device_id=${r.referred_device_id ?? 'null'}${overlaps.length ? ` [${overlaps.join(' + ')} — expected for in-person referrals; corroborate before acting]` : ''}`,
  )
}

async function main() {
  const discordId = process.argv[2]
  if (!discordId) {
    console.error('usage: bun scripts/diagnose-glm-referral.ts <discord_id>')
    process.exit(1)
  }

  const [u] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.discord_id, discordId))
    .limit(1)
  if (!u) {
    console.log(`No user found with discord_id ${discordId}`)
    return
  }

  console.log('=== USER ===')
  console.log({
    id: u.id,
    name: u.name,
    discord_id: u.discord_id,
    referral_code: u.referral_code,
    created_at: u.created_at,
    banned: u.banned,
    github_id: await githubFor(u.id),
  })

  const asReferrer = await db
    .select()
    .from(schema.referralV2)
    .where(eq(schema.referralV2.referrer_id, u.id))
  console.log(`\n=== referral_v2 rows where they are the REFERRER (${asReferrer.length}) ===`)
  for (const r of asReferrer) await dumpRow('referred-by-them', r)

  const asReferred = await db
    .select()
    .from(schema.referralV2)
    .where(eq(schema.referralV2.referred_id, u.id))
  console.log(`\n=== referral_v2 rows where they are the REFERRED (${asReferred.length}) ===`)
  for (const r of asReferred) await dumpRow('their-own-referral', r)

  const stats = await getReferralStats({ referrerId: u.id })
  const glm = await getGlmReferralEntitlement({ userId: u.id })
  console.log('\n=== COMPUTED (live) ===')
  console.log({ stats, glmWeeklyEntitlement: glm })
  console.log(
    '\nNOTE: glmWeeklyEntitlement>0 means they EARNED GLM. To USE it they must also be on full access at session start (limited-tier users are downgraded).',
  )

  // Also check the legacy table in case attribution only ever landed there.
  const legacy = await db
    .select({
      program: schema.referral.program,
      referrer: schema.referral.referrer_id,
      referred: schema.referral.referred_id,
      qualified_at: schema.referral.qualified_at,
      status: schema.referral.status,
    })
    .from(schema.referral)
    .where(
      or(
        eq(schema.referral.referrer_id, u.id),
        eq(schema.referral.referred_id, u.id),
      ),
    )
  console.log(`\n=== legacy referral rows (${legacy.length}) ===`)
  for (const r of legacy) console.log('  ', r)

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
