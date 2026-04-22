/**
 * Inspect currently-active and queued freebuff users to spot bots / users
 * operating multiple accounts.
 *
 * Signals collected per free_session row:
 *   - user profile (email, created_at, banned, discord_id, handle)
 *   - recent message count (24h) on freebuff agent
 *   - linked login provider (google / github / discord / etc.)
 *   - linked device fingerprints + how many OTHER users share each fingerprint
 *   - distinct IPs / fingerprint sig_hashes
 *
 * Heuristic red flags are printed next to each user.
 *
 * usage:  bun scripts/inspect-freebuff-active.ts
 */

import { FREEBUFF_ROOT_AGENT_IDS } from '@codebuff/common/constants/free-agents'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { sql, eq, inArray, desc, and, gte } from 'drizzle-orm'

const WINDOW_HOURS = 24

async function main() {
  const cutoff = new Date(Date.now() - WINDOW_HOURS * 3600_000)

  // 1) All current free_session rows
  const sessions = await db
    .select({
      user_id: schema.freeSession.user_id,
      status: schema.freeSession.status,
      model: schema.freeSession.model,
      active_instance_id: schema.freeSession.active_instance_id,
      queued_at: schema.freeSession.queued_at,
      admitted_at: schema.freeSession.admitted_at,
      expires_at: schema.freeSession.expires_at,
      updated_at: schema.freeSession.updated_at,
      email: schema.user.email,
      name: schema.user.name,
      handle: schema.user.handle,
      discord_id: schema.user.discord_id,
      banned: schema.user.banned,
      user_created_at: schema.user.created_at,
    })
    .from(schema.freeSession)
    .leftJoin(schema.user, eq(schema.freeSession.user_id, schema.user.id))
    .orderBy(schema.freeSession.status, schema.freeSession.queued_at)

  if (sessions.length === 0) {
    console.log('No free_session rows found.')
    return
  }

  const userIds = sessions.map((s) => s.user_id)

  // 2) Message counts & hourly spread in last 24h for these users
  const msgStats = await db
    .select({
      user_id: schema.message.user_id,
      count: sql<number>`COUNT(*)`,
      distinctHours: sql<number>`COUNT(DISTINCT EXTRACT(HOUR FROM ${schema.message.finished_at}))`,
      firstMsg: sql<string>`MIN(${schema.message.finished_at})`,
      lastMsg: sql<string>`MAX(${schema.message.finished_at})`,
    })
    .from(schema.message)
    .where(
      and(
        inArray(schema.message.user_id, userIds),
        inArray(schema.message.agent_id, FREEBUFF_ROOT_AGENT_IDS),
        gte(schema.message.finished_at, cutoff),
      ),
    )
    .groupBy(schema.message.user_id)
  const msgByUser = new Map(msgStats.map((m) => [m.user_id!, m]))

  // Lifetime freebuff message count
  const lifetime = await db
    .select({
      user_id: schema.message.user_id,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.message)
    .where(
      and(
        inArray(schema.message.user_id, userIds),
        inArray(schema.message.agent_id, FREEBUFF_ROOT_AGENT_IDS),
      ),
    )
    .groupBy(schema.message.user_id)
  const lifetimeByUser = new Map(lifetime.map((m) => [m.user_id!, Number(m.count)]))

  // 3) Login providers
  const accounts = await db
    .select({
      userId: schema.account.userId,
      provider: schema.account.provider,
      providerAccountId: schema.account.providerAccountId,
    })
    .from(schema.account)
    .where(inArray(schema.account.userId, userIds))
  const providersByUser = new Map<string, string[]>()
  for (const a of accounts) {
    if (!providersByUser.has(a.userId)) providersByUser.set(a.userId, [])
    providersByUser.get(a.userId)!.push(a.provider)
  }

  // 4) Fingerprints used by these users, and fp-sharing counts
  const sessRows = await db
    .select({
      userId: schema.session.userId,
      fingerprint_id: schema.session.fingerprint_id,
      type: schema.session.type,
    })
    .from(schema.session)
    .where(inArray(schema.session.userId, userIds))
  const fpsByUser = new Map<string, Set<string>>()
  const allFps = new Set<string>()
  for (const s of sessRows) {
    if (!s.fingerprint_id) continue
    allFps.add(s.fingerprint_id)
    if (!fpsByUser.has(s.userId)) fpsByUser.set(s.userId, new Set())
    fpsByUser.get(s.userId)!.add(s.fingerprint_id)
  }

  // For each fingerprint, count how many distinct users have it (site-wide)
  let fpUserCounts = new Map<string, number>()
  let fpSigHash = new Map<string, string | null>()
  if (allFps.size > 0) {
    const fpShares = await db
      .select({
        fingerprint_id: schema.session.fingerprint_id,
        userCount: sql<number>`COUNT(DISTINCT ${schema.session.userId})`,
      })
      .from(schema.session)
      .where(inArray(schema.session.fingerprint_id, [...allFps]))
      .groupBy(schema.session.fingerprint_id)
    fpUserCounts = new Map(
      fpShares.map((r) => [r.fingerprint_id!, Number(r.userCount)]),
    )

    const fpRows = await db
      .select({
        id: schema.fingerprint.id,
        sig_hash: schema.fingerprint.sig_hash,
      })
      .from(schema.fingerprint)
      .where(inArray(schema.fingerprint.id, [...allFps]))
    fpSigHash = new Map(fpRows.map((f) => [f.id, f.sig_hash]))
  }

  // 5) sig_hash sharing across all users (to catch rotated fingerprints from same device)
  const sigHashes = [...new Set([...fpSigHash.values()].filter((s): s is string => !!s))]
  let sigHashUserCounts = new Map<string, number>()
  if (sigHashes.length > 0) {
    const rows = await db
      .select({
        sig_hash: schema.fingerprint.sig_hash,
        userCount: sql<number>`COUNT(DISTINCT ${schema.session.userId})`,
      })
      .from(schema.session)
      .innerJoin(
        schema.fingerprint,
        eq(schema.session.fingerprint_id, schema.fingerprint.id),
      )
      .where(inArray(schema.fingerprint.sig_hash, sigHashes))
      .groupBy(schema.fingerprint.sig_hash)
    sigHashUserCounts = new Map(rows.map((r) => [r.sig_hash!, Number(r.userCount)]))
  }

  // ---- Print ----

  const statusCounts: Record<string, number> = {}
  for (const s of sessions) {
    statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1
  }
  console.log(
    `\n${sessions.length} free_session rows:  ` +
      Object.entries(statusCounts)
        .map(([k, v]) => `${k}=${v}`)
        .join('  '),
  )
  console.log(`window for 'msgs24h' and 'hrs24h' = last ${WINDOW_HOURS}h\n`)

  console.log(
    [
      'status'.padEnd(7),
      'model'.padEnd(28),
      'email'.padEnd(36),
      'age_d'.padStart(6),
      'msgs24'.padStart(7),
      'hrs24'.padStart(5),
      'msgLT'.padStart(7),
      'providers'.padEnd(16),
      'fps'.padStart(4),
      'maxFpShare'.padStart(10),
      'maxSigShare'.padStart(11),
      'flags',
    ].join('  '),
  )
  console.log('-'.repeat(160))

  const flaggedUsers: { email: string; reasons: string[] }[] = []

  for (const s of sessions) {
    const now = Date.now()
    const ageDays = s.user_created_at
      ? (now - s.user_created_at.getTime()) / 86400_000
      : Infinity
    const stats = msgByUser.get(s.user_id)
    const msgs24 = Number(stats?.count ?? 0)
    const hrs24 = Number(stats?.distinctHours ?? 0)
    const msgLT = lifetimeByUser.get(s.user_id) ?? 0
    const providers = (providersByUser.get(s.user_id) ?? []).sort()
    const fps = fpsByUser.get(s.user_id) ?? new Set<string>()
    const maxFpShare = Math.max(
      0,
      ...[...fps].map((fp) => fpUserCounts.get(fp) ?? 0),
    )
    const sigHashesForUser = [...fps]
      .map((fp) => fpSigHash.get(fp))
      .filter((h): h is string => !!h)
    const maxSigShare = Math.max(
      0,
      ...sigHashesForUser.map((h) => sigHashUserCounts.get(h) ?? 0),
    )

    const flags: string[] = []
    if (s.banned) flags.push('BANNED')
    if (maxFpShare >= 3) flags.push(`fp-shared-by-${maxFpShare}`)
    if (maxSigShare >= 3) flags.push(`sigHash-shared-by-${maxSigShare}`)
    if (ageDays < 1) flags.push('new-acct<1d')
    else if (ageDays < 7) flags.push('new-acct<7d')
    if (msgs24 >= 300) flags.push(`heavy-msgs:${msgs24}`)
    if (msgs24 >= 50 && hrs24 >= 20) flags.push('24-7-usage')
    if (providers.length === 0 && msgLT > 0) flags.push('no-oauth')
    // Auto-generated looking email/handle
    if (s.email && /\+[a-z0-9]{6,}@/i.test(s.email)) flags.push('plus-alias')
    if (s.email && /^[a-z]{3,8}\d{4,}@/i.test(s.email)) flags.push('email-digits')
    if (s.handle && /^user[-_]?\d+/i.test(s.handle)) flags.push('handle-userN')

    const email = s.email ?? s.user_id.slice(0, 8)
    if (flags.length) flaggedUsers.push({ email, reasons: flags })

    console.log(
      [
        s.status.padEnd(7),
        (s.model ?? '').slice(0, 27).padEnd(28),
        email.slice(0, 35).padEnd(36),
        (ageDays === Infinity ? '?' : ageDays.toFixed(1)).padStart(6),
        msgs24.toString().padStart(7),
        hrs24.toString().padStart(5),
        msgLT.toString().padStart(7),
        providers.join(',').slice(0, 15).padEnd(16),
        fps.size.toString().padStart(4),
        maxFpShare.toString().padStart(10),
        maxSigShare.toString().padStart(11),
        flags.join(' '),
      ].join('  '),
    )
  }

  console.log(`\n${flaggedUsers.length} sessions have at least one red flag.`)
  if (flaggedUsers.length > 0) {
    console.log('\nSuspicious summary:')
    for (const f of flaggedUsers) {
      console.log(`  ${f.email}   ${f.reasons.join(' ')}`)
    }
  }

  // Clusters of users sharing the same sig_hash
  const clusters: Record<string, string[]> = {}
  for (const s of sessions) {
    const fps = fpsByUser.get(s.user_id) ?? new Set<string>()
    const userSigs = [...fps]
      .map((fp) => fpSigHash.get(fp))
      .filter((h): h is string => !!h)
    for (const h of userSigs) {
      if ((sigHashUserCounts.get(h) ?? 0) >= 2) {
        if (!clusters[h]) clusters[h] = []
        clusters[h].push(s.email ?? s.user_id.slice(0, 8))
      }
    }
  }
  const sharedClusters = Object.entries(clusters).filter(([, users]) => users.length >= 2)
  if (sharedClusters.length > 0) {
    console.log(`\nClusters of active/queued freebuff users sharing a device sig_hash:`)
    for (const [h, users] of sharedClusters) {
      console.log(`  sig_hash=${h.slice(0, 12)}…  n=${users.length}`)
      for (const u of [...new Set(users)]) console.log(`    ${u}`)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
