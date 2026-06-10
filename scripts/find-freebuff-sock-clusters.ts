/**
 * Find Freebuff sock-account clusters by two shared-identity signals, as a
 * companion to scripts/find-freebuff-api-suspects.ts (which scores accounts by
 * request *behavior*). This script groups *accounts* that share an identity
 * fingerprint, to surface coordinated rings the per-account scorer sees only
 * one-at-a-time.
 *
 * Read-only. Production usage:
 *   infisical run --env=prod --silent -- bun scripts/find-freebuff-sock-clusters.ts
 *   … bun scripts/find-freebuff-sock-clusters.ts --min-users 3 --only-unbanned
 *
 * Two signals (see docs/freebuff-abuse-detection.md):
 *
 *  1. fingerprint_id sharing — accounts whose CLI `session` rows point at the
 *     same `fingerprint.id`. A farm run from one CLI install shares one
 *     fingerprint_id (observed: the BPS ring = 8 accounts/1 fp, STT Bandung = 9
 *     accounts/1 fp, all banned). Distinct real machines get distinct
 *     fingerprint_ids, so universities/shared-NAT do NOT cluster here — BUT
 *     ephemeral/containerized environments that bake one image (Google Cloud
 *     Qwiklabs, Codespaces, Docker) DO share a fingerprint across many unrelated
 *     real users. The discriminator is the **account-creation span**: a farm
 *     registers its accounts in minutes-to-hours; a shared cloud env accretes
 *     real users over weeks-to-months. The TIGHT column flags users>=4 created
 *     within 48h — that's the farm signal. Defeated by per-account fingerprint
 *     rotation.
 *
 *  2. client_ip_hash sharing — accounts sharing an egress IP hash
 *     (free_mode_country_access_cache). Catches IP-stable farms, but HIGH
 *     false-positive: universities, bootcamps, and CGNAT carriers legitimately
 *     share one IP across many users. Use the banned-ratio + domain diversity to
 *     separate a farm (banned-heavy, one/two domains) from a shared NAT
 *     (low-banned, diverse domains). This signal informs human review; it is NOT
 *     a ban-on-sight.
 *
 * Neither is wired into a request-time rate limit: per-IP limiting throttles
 * legit shared networks (measured: many 10-120-user IPs with 0 banned), and
 * per-fingerprint limiting needs CLI→endpoint plumbing the request body lacks
 * today. Both live here as detection inputs to the human-in-the-loop ban flow.
 */
import { db } from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'

type Args = {
  minUsers: number
  ipMinUsers: number
  limit: number
  onlyUnbanned: boolean
}

function intArg(flag: string, def: number): number {
  const i = process.argv.indexOf(flag)
  if (i < 0) return def
  const v = Number.parseInt(process.argv[i + 1] ?? '', 10)
  return Number.isFinite(v) && v > 0 ? v : def
}

function parseArgs(): Args {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`Find Freebuff sock-account clusters.

Options:
  --min-users n      Min distinct accounts on a shared fingerprint_id. Default: 3.
  --ip-min-users n   Min distinct accounts on a shared client_ip_hash. Default: 8.
  --limit n          Max clusters per section. Default: 40.
  --only-unbanned    Show only clusters with at least one not-yet-banned account
                     (i.e. actionable rings, hiding fully-cleaned ones).
`)
    process.exit(0)
  }
  return {
    minUsers: intArg('--min-users', 3),
    ipMinUsers: intArg('--ip-min-users', 8),
    limit: intArg('--limit', 40),
    onlyUnbanned: process.argv.includes('--only-unbanned'),
  }
}

function pad(v: unknown, n: number): string {
  return String(v).padEnd(n)
}
function lpad(v: unknown, n: number): string {
  return String(v).padStart(n)
}

async function fingerprintClusters(args: Args) {
  // Accounts sharing one fingerprint_id. Scoped to fingerprints touched by
  // free-mode CLI users by joining sessions → users; we report all so the
  // banned/age columns let the operator triage.
  const rows = await db.execute(sql`
    WITH fp AS (
      SELECT s.fingerprint_id,
             COUNT(DISTINCT s."userId") AS users,
             COUNT(DISTINCT s."userId") FILTER (WHERE u.banned) AS banned,
             MIN(u.created_at) AS first_created,
             MAX(u.created_at) AS last_created,
             ARRAY_AGG(DISTINCT split_part(u.email, '@', 2)) AS domains
      FROM "session" s
      JOIN "user" u ON u.id = s."userId"
      WHERE s.fingerprint_id IS NOT NULL
      GROUP BY s.fingerprint_id
    )
    SELECT users, banned,
           EXTRACT(EPOCH FROM (last_created - first_created)) / 3600 AS span_hours,
           -- Farm signal: >=4 accounts all created within 48h on one fingerprint.
           (users >= 4 AND EXTRACT(EPOCH FROM (last_created - first_created)) < 48 * 3600) AS tight,
           (domains)[1:8] AS domains
    FROM fp
    WHERE users >= ${args.minUsers}
      ${args.onlyUnbanned ? sql`AND banned < users` : sql``}
    -- Surface tight (likely-farm) and not-yet-cleaned clusters first.
    ORDER BY tight DESC, (users - banned) DESC, users DESC
    LIMIT ${args.limit}
  `)
  console.log(
    `\n=== shared fingerprint_id clusters (>= ${args.minUsers} accounts${args.onlyUnbanned ? ', actionable only' : ''}) ===`,
  )
  console.log('  (TIGHT = >=4 accounts created within 48h on one fingerprint = likely farm; wide span + 0 banned = shared cloud env, e.g. qwiklabs/codespaces — review)')
  console.log('  TIGHT  users  banned  unbanned  acctCreateSpan  domains')
  for (const r of rows as any[]) {
    const span =
      r.span_hours == null
        ? '?'
        : r.span_hours < 48
          ? `${Number(r.span_hours).toFixed(1)}h`
          : `${(Number(r.span_hours) / 24).toFixed(1)}d`
    const dom = (r.domains as string[]).filter(Boolean).join(', ')
    console.log(
      `  ${pad(r.tight ? 'FARM?' : '', 5)}  ${lpad(r.users, 5)}  ${lpad(r.banned, 6)}  ${lpad(Number(r.users) - Number(r.banned), 8)}  ${pad(span, 14)}  ${dom}`,
    )
  }
  if ((rows as any[]).length === 0) console.log('  (none)')
}

async function ipClusters(args: Args) {
  const rows = await db.execute(sql`
    WITH ip AS (
      SELECT c.client_ip_hash,
             COUNT(DISTINCT c.user_id) AS users,
             COUNT(DISTINCT c.user_id) FILTER (WHERE u.banned) AS banned,
             ARRAY_AGG(DISTINCT split_part(u.email, '@', 2)) AS domains
      FROM free_mode_country_access_cache c
      JOIN "user" u ON u.id = c.user_id
      WHERE c.client_ip_hash IS NOT NULL
      GROUP BY c.client_ip_hash
    )
    SELECT users, banned,
           ROUND(100.0 * banned / NULLIF(users, 0)) AS banned_pct,
           -- domains is already ARRAY_AGG(DISTINCT …), so its length is the
           -- distinct-domain count (the [1:8] slice below only caps the display).
           cardinality(domains) AS distinct_domains,
           (domains)[1:8] AS domains
    FROM ip
    WHERE users >= ${args.ipMinUsers}
      ${args.onlyUnbanned ? sql`AND banned < users` : sql``}
    ORDER BY banned_pct DESC, users DESC
    LIMIT ${args.limit}
  `)
  console.log(
    `\n=== shared client_ip_hash clusters (>= ${args.ipMinUsers} accounts) ===`,
  )
  console.log('  (high banned% + few domains = likely farm; low banned% + many domains = shared NAT/university — review, do NOT bulk-ban)')
  console.log('  users  banned  banned%  domains#  domains')
  for (const r of rows as any[]) {
    const dom = (r.domains as string[]).filter(Boolean).join(', ')
    console.log(
      `  ${lpad(r.users, 5)}  ${lpad(r.banned, 6)}  ${lpad(r.banned_pct ?? 0, 6)}%  ${lpad(r.distinct_domains, 7)}   ${dom}`,
    )
  }
  if ((rows as any[]).length === 0) console.log('  (none)')
}

async function main() {
  const args = parseArgs()
  await fingerprintClusters(args)
  await ipClusters(args)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
