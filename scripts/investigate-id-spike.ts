/**
 * Investigate a freebuff live-counter / admission spike straight off
 * `free_session` + `free_session_admit` — no `message` rows required, so it sees
 * the "idle-session farm" (admit-and-hold, ~0 messages) that the message-driven
 * suspect/cluster scanners are blind to. Read-only. See
 * docs/freebuff-abuse-detection.md ("Idle-session farm", playbook step 0).
 *
 *  1) Admissions per UTC hour over a lookback window (find the spike).
 *  2) For the spike window: admissions broken down by country.
 *  3) The target-country cohort admitted in the window, with abuse flags
 *     (new account, fingerprint/IP-hash sharing, no agent-step coverage,
 *     null repo_url, msgs==runs farm tell), plus account-creation-by-day and
 *     shared-egress-IP clustering.
 *
 * The cohort country defaults to ID; change the `'ID'` literal in step 3 for
 * other countries. First built for the 2026-06-20 Indonesia farm.
 *
 * usage:
 *   infisical run --env=prod --silent -- bun scripts/investigate-id-spike.ts
 *   ... -- bun scripts/investigate-id-spike.ts --hours 48 \
 *         --from "2026-06-20T07:00:00Z" --to "2026-06-20T10:00:00Z"
 */

import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { sql, eq, inArray, and, gte, lte } from 'drizzle-orm'

function arg(name: string, def?: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}

const LOOKBACK_H = Number(arg('hours', '48'))
// Default spike window: 1am PT = 08:00 UTC (PDT = UTC-7), +/- a couple hours.
const FROM = new Date(arg('from', '2026-06-20T06:00:00Z')!)
const TO = new Date(arg('to', '2026-06-20T11:00:00Z')!)
// Cohort country to drill into (ISO-3166 alpha-2, e.g. ID, IN, US).
const COUNTRY = (arg('country', 'ID')!).toUpperCase()

async function main() {
  const lookbackCutoff = new Date(Date.now() - LOOKBACK_H * 3600_000)

  // ---- 1) Admissions per UTC hour ----
  const hourly = await db
    .select({
      hour: sql<string>`date_trunc('hour', ${schema.freeSessionAdmit.admitted_at})`,
      admits: sql<number>`COUNT(*)`,
      users: sql<number>`COUNT(DISTINCT ${schema.freeSessionAdmit.user_id})`,
    })
    .from(schema.freeSessionAdmit)
    .where(gte(schema.freeSessionAdmit.admitted_at, lookbackCutoff))
    .groupBy(sql`1`)
    .orderBy(sql`1`)

  const maxAdmits = Math.max(...hourly.map((h) => Number(h.admits)), 1)
  console.log(`\n=== Admissions per UTC hour (last ${LOOKBACK_H}h) ===`)
  console.log('(1am PT ≈ 08:00 UTC)\n')
  for (const h of hourly) {
    const n = Number(h.admits)
    const bar = '█'.repeat(Math.round((n / maxAdmits) * 50))
    console.log(
      `${new Date(h.hour).toISOString().slice(0, 13)}Z  ${n
        .toString()
        .padStart(5)} admits  ${Number(h.users)
        .toString()
        .padStart(5)} users  ${bar}`,
    )
  }

  // ---- 2) Country breakdown in the spike window ----
  // free_session_admit has no country; join to free_session (latest country per
  // user). Approximate but fine for cohort sizing.
  const byCountry = await db
    .select({
      country: sql<string>`COALESCE(${schema.freeSession.country_code}, ${schema.freeSession.geoip_country}, '??')`,
      admits: sql<number>`COUNT(*)`,
      users: sql<number>`COUNT(DISTINCT ${schema.freeSessionAdmit.user_id})`,
    })
    .from(schema.freeSessionAdmit)
    .leftJoin(
      schema.freeSession,
      eq(schema.freeSessionAdmit.user_id, schema.freeSession.user_id),
    )
    .where(
      and(
        gte(schema.freeSessionAdmit.admitted_at, FROM),
        lte(schema.freeSessionAdmit.admitted_at, TO),
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`2 DESC`)

  console.log(
    `\n=== Country breakdown for admissions ${FROM.toISOString()} → ${TO.toISOString()} ===\n`,
  )
  for (const c of byCountry) {
    console.log(
      `${(c.country ?? '??').padEnd(6)} ${Number(c.admits)
        .toString()
        .padStart(6)} admits  ${Number(c.users).toString().padStart(6)} users`,
    )
  }

  // ---- 3) Indonesia cohort in the window ----
  const idUserRows = await db
    .select({
      user_id: schema.freeSessionAdmit.user_id,
      admits: sql<number>`COUNT(*)`,
      firstAdmit: sql<string>`MIN(${schema.freeSessionAdmit.admitted_at})`,
      lastAdmit: sql<string>`MAX(${schema.freeSessionAdmit.admitted_at})`,
      model: sql<string>`MAX(${schema.freeSessionAdmit.model})`,
      country: sql<string>`MAX(COALESCE(${schema.freeSession.country_code}, ${schema.freeSession.geoip_country}))`,
      ip_hash: sql<string>`MAX(${schema.freeSession.client_ip_hash})`,
      ip_privacy: sql<string>`MAX(array_to_string(${schema.freeSession.ip_privacy_signals}, ','))`,
    })
    .from(schema.freeSessionAdmit)
    .leftJoin(
      schema.freeSession,
      eq(schema.freeSessionAdmit.user_id, schema.freeSession.user_id),
    )
    .where(
      and(
        gte(schema.freeSessionAdmit.admitted_at, FROM),
        lte(schema.freeSessionAdmit.admitted_at, TO),
        sql`COALESCE(${schema.freeSession.country_code}, ${schema.freeSession.geoip_country}) = ${COUNTRY}`,
      ),
    )
    .groupBy(schema.freeSessionAdmit.user_id)

  console.log(
    `\n=== ${COUNTRY} accounts admitted in window: ${idUserRows.length} ===\n`,
  )
  if (idUserRows.length === 0) {
    console.log(
      `None for ${COUNTRY}. Try a wider --from/--to, a different --country, or check geoip_country values.`,
    )
    return
  }

  const userIds = idUserRows.map((r) => r.user_id)

  // User profile
  const users = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      name: schema.user.name,
      handle: schema.user.handle,
      banned: schema.user.banned,
      created_at: schema.user.created_at,
    })
    .from(schema.user)
    .where(inArray(schema.user.id, userIds))
  const userById = new Map(users.map((u) => [u.id, u]))

  // Message stats in window (farm/proxy tells)
  const msgStats = await db
    .select({
      user_id: schema.message.user_id,
      msgs: sql<number>`COUNT(*)`,
      runs: sql<number>`COUNT(DISTINCT ${schema.message.client_request_id})`,
      clients: sql<number>`COUNT(DISTINCT ${schema.message.client_id})`,
      withRepo: sql<number>`COUNT(*) FILTER (WHERE ${schema.message.repo_url} IS NOT NULL)`,
    })
    .from(schema.message)
    .where(
      and(
        inArray(schema.message.user_id, userIds),
        gte(schema.message.finished_at, FROM),
      ),
    )
    .groupBy(schema.message.user_id)
  const msgByUser = new Map(msgStats.map((m) => [m.user_id!, m]))

  // Agent-step coverage: how many of these users' messages have a real agent_step
  const stepStats = await db
    .select({
      user_id: schema.message.user_id,
      withStep: sql<number>`COUNT(DISTINCT ${schema.agentStep.message_id})`,
    })
    .from(schema.message)
    .innerJoin(
      schema.agentStep,
      eq(schema.agentStep.message_id, schema.message.id),
    )
    .where(
      and(
        inArray(schema.message.user_id, userIds),
        gte(schema.message.finished_at, FROM),
      ),
    )
    .groupBy(schema.message.user_id)
  const stepByUser = new Map(stepStats.map((s) => [s.user_id!, Number(s.withStep)]))

  // Fingerprint sharing (CLI session rows)
  const sessRows = await db
    .select({
      userId: schema.session.userId,
      fingerprint_id: schema.session.fingerprint_id,
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
  let fpUserCounts = new Map<string, number>()
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
  }

  // IP-hash sharing within the cohort
  const ipCounts = new Map<string, number>()
  for (const r of idUserRows) {
    if (r.ip_hash) ipCounts.set(r.ip_hash, (ipCounts.get(r.ip_hash) ?? 0) + 1)
  }

  // ---- Print cohort ----
  console.log(
    [
      'email'.padEnd(34),
      'age_d'.padStart(6),
      'adm'.padStart(4),
      'msgs'.padStart(6),
      'runs'.padStart(6),
      'clnt'.padStart(5),
      'step%'.padStart(6),
      'repo'.padStart(5),
      'fpShare'.padStart(8),
      'ipShare'.padStart(8),
      'flags',
    ].join('  '),
  )
  console.log('-'.repeat(150))

  const flagged: { email: string; reasons: string[]; created: Date | null }[] = []
  let newAcctCount = 0
  for (const r of idUserRows) {
    const u = userById.get(r.user_id)
    const ageDays = u?.created_at
      ? (Date.now() - u.created_at.getTime()) / 86400_000
      : Infinity
    const m = msgByUser.get(r.user_id)
    const msgs = Number(m?.msgs ?? 0)
    const runs = Number(m?.runs ?? 0)
    const clients = Number(m?.clients ?? 0)
    const withRepo = Number(m?.withRepo ?? 0)
    const withStep = stepByUser.get(r.user_id) ?? 0
    const stepPct = msgs > 0 ? Math.round((withStep / msgs) * 100) : 0
    const fps = fpsByUser.get(r.user_id) ?? new Set<string>()
    const maxFpShare = Math.max(0, ...[...fps].map((fp) => fpUserCounts.get(fp) ?? 0))
    const ipShare = r.ip_hash ? ipCounts.get(r.ip_hash) ?? 1 : 0

    const flags: string[] = []
    if (u?.banned) flags.push('BANNED')
    if (ageDays < 1) {
      flags.push('new<1d')
      newAcctCount++
    } else if (ageDays < 7) flags.push('new<7d')
    if (msgs >= 5 && stepPct <= 5) flags.push(`no-steps:${stepPct}%`)
    if (msgs >= 5 && withRepo === 0) flags.push('null-repo')
    if (runs >= 5 && msgs === runs) flags.push('msgs==runs(farm)')
    if (clients >= 10) flags.push(`fanout:${clients}clients`)
    if (maxFpShare >= 3) flags.push(`fp×${maxFpShare}`)
    if (ipShare >= 3) flags.push(`ip×${ipShare}`)
    if (r.ip_privacy) flags.push(`priv:${r.ip_privacy}`)
    if (u?.email && /^[a-z]{3,10}\d{3,}@/i.test(u.email)) flags.push('email-digits')

    const email = u?.email ?? r.user_id.slice(0, 12)
    if (flags.length) flagged.push({ email, reasons: flags, created: u?.created_at ?? null })

    console.log(
      [
        email.slice(0, 33).padEnd(34),
        (ageDays === Infinity ? '?' : ageDays.toFixed(1)).padStart(6),
        Number(r.admits).toString().padStart(4),
        msgs.toString().padStart(6),
        runs.toString().padStart(6),
        clients.toString().padStart(5),
        `${stepPct}%`.padStart(6),
        withRepo.toString().padStart(5),
        maxFpShare.toString().padStart(8),
        ipShare.toString().padStart(8),
        flags.join(' '),
      ].join('  '),
    )
  }

  // Account-creation clustering (farm tell): how many ID accounts created same day
  const createdDays = new Map<string, number>()
  for (const u of users) {
    if (!u.created_at) continue
    const d = u.created_at.toISOString().slice(0, 10)
    createdDays.set(d, (createdDays.get(d) ?? 0) + 1)
  }
  console.log(`\n=== ${COUNTRY} cohort account-creation by day ===`)
  for (const [d, n] of [...createdDays.entries()].sort()) {
    console.log(`  ${d}  ${n}`)
  }

  // IP-hash clusters within cohort
  const ipClusters = [...ipCounts.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])
  if (ipClusters.length) {
    console.log(`\n=== Shared egress IP-hash within ${COUNTRY} cohort (n≥3) ===`)
    for (const [h, n] of ipClusters) console.log(`  ${h.slice(0, 16)}…  ${n} accounts`)
  }

  console.log(
    `\nSummary: ${idUserRows.length} ${COUNTRY} accounts admitted in window; ` +
      `${newAcctCount} created <1d ago; ${flagged.length} flagged.`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
