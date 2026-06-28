/**
 * One-off: who signed up in the last N hours, where they came from, and which
 * look illegitimate. Read-only.
 *
 * usage:
 *   infisical run --env=prod --silent -- bun scripts/signups-last-24h.ts
 *   infisical run --env=prod --silent -- bun scripts/signups-last-24h.ts --hours 48
 */

import db from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'

const hIdx = process.argv.indexOf('--hours')
const HOURS = hIdx >= 0 ? Number(process.argv[hIdx + 1]) : 24
const since = sql`now() - (${HOURS} || ' hours')::interval`

async function main() {
  console.log(`\n################  SIGNUPS IN THE LAST ${HOURS}h  ################`)

  // ---- volume + headline ----------------------------------------------------
  const [head] = [...(await db.execute(sql`
    SELECT
      count(*)::int AS new_users,
      count(*) FILTER (WHERE banned)::int AS already_banned,
      count(*) FILTER (WHERE "emailVerified" IS NOT NULL)::int AS email_verified
    FROM "user" WHERE created_at >= ${since}
  `))] as any[]
  console.log('\n=== headline ===')
  console.table([head])

  // ---- by hour --------------------------------------------------------------
  console.log('\n=== signups by hour ===')
  console.table([...(await db.execute(sql`
    SELECT to_char(date_trunc('hour', created_at), 'MM-DD HH24:00') AS hour,
           count(*)::int AS n
    FROM "user" WHERE created_at >= ${since}
    GROUP BY 1 ORDER BY 1
  `))])

  // ---- auth provider --------------------------------------------------------
  console.log('\n=== auth provider (how they signed in) ===')
  console.table([...(await db.execute(sql`
    SELECT coalesce(a.provider, '(none — no account row)') AS provider, count(*)::int AS n
    FROM "user" u
    LEFT JOIN account a ON a."userId" = u.id
    WHERE u.created_at >= ${since}
    GROUP BY 1 ORDER BY n DESC
  `))])

  // ---- referred vs organic --------------------------------------------------
  console.log('\n=== acquisition: referred vs organic ===')
  console.table([...(await db.execute(sql`
    WITH nu AS (SELECT id FROM "user" WHERE created_at >= ${since})
    SELECT
      count(*)::int AS new_users,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM referral r WHERE r.referred_id = nu.id))::int AS referred,
      count(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM referral r WHERE r.referred_id = nu.id))::int AS organic
    FROM nu
  `))])

  // ---- top referrers driving these signups ----------------------------------
  console.log('\n=== top referrers driving last-' + HOURS + 'h signups (with referrer ban status) ===')
  console.table([...(await db.execute(sql`
    WITH nu AS (SELECT id FROM "user" WHERE created_at >= ${since})
    SELECT ru.email AS referrer, ru.banned AS referrer_banned,
           count(DISTINCT r.referred_id)::int AS new_referreds
    FROM nu
    JOIN referral r ON r.referred_id = nu.id
    JOIN "user" ru ON ru.id = r.referrer_id
    GROUP BY ru.email, ru.banned
    ORDER BY new_referreds DESC
    LIMIT 20
  `))])

  // ---- geography (from free_session country gate) ---------------------------
  console.log('\n=== geography of new users who started a free session ===')
  console.table([...(await db.execute(sql`
    SELECT coalesce(fs.country_code, fs.cf_country, fs.geoip_country, '(no session)') AS country,
           count(*)::int AS n
    FROM "user" u
    LEFT JOIN free_session fs ON fs.user_id = u.id
    WHERE u.created_at >= ${since}
    GROUP BY 1 ORDER BY n DESC
    LIMIT 25
  `))])

  // ---- email domains --------------------------------------------------------
  console.log('\n=== top email domains ===')
  console.table([...(await db.execute(sql`
    SELECT split_part(email, '@', 2) AS domain, count(*)::int AS n
    FROM "user" WHERE created_at >= ${since}
    GROUP BY 1 ORDER BY n DESC LIMIT 20
  `))])

  // ---- activity: did they actually use the product? -------------------------
  console.log('\n=== did new users run the agent? ===')
  console.table([...(await db.execute(sql`
    WITH nu AS (SELECT id FROM "user" WHERE created_at >= ${since})
    SELECT
      count(*)::int AS new_users,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM agent_run ar WHERE ar.user_id = nu.id))::int AS ran_agent,
      count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM agent_run ar WHERE ar.user_id = nu.id))::int AS never_ran
    FROM nu
  `))])

  // ========================  LEGITIMACY SIGNALS  ============================
  console.log('\n################  LEGITIMACY SIGNALS  ################')

  // 1. referred by an already-banned referrer (farm continuation)
  console.log('\n=== new users referred by an ALREADY-BANNED referrer ===')
  console.table([...(await db.execute(sql`
    SELECT ru.email AS banned_referrer, count(DISTINCT r.referred_id)::int AS new_referreds
    FROM "user" u
    JOIN referral r ON r.referred_id = u.id
    JOIN "user" ru ON ru.id = r.referrer_id AND ru.banned = true
    WHERE u.created_at >= ${since}
    GROUP BY ru.email ORDER BY new_referreds DESC
  `))])

  // 2. github dormancy of new users that linked github (0 repos & 0 followers, aged acct)
  console.log('\n=== GitHub profile quality of new users w/ a linked GitHub account ===')
  console.table([...(await db.execute(sql`
    WITH nu AS (
      SELECT u.id, qf.github_public_repos rp, qf.github_followers fo, qf.github_account_created_at gac
      FROM "user" u
      JOIN account a ON a."userId" = u.id AND a.provider='github'
      LEFT JOIN referral_qualification qf ON qf.github_user_id = a."providerAccountId"
      WHERE u.created_at >= ${since}
    )
    SELECT
      count(*)::int AS github_users,
      count(*) FILTER (WHERE rp IS NULL)::int AS no_facts_cached,
      count(*) FILTER (WHERE coalesce(rp,0)=0 AND coalesce(fo,0)=0)::int AS dormant_0_0,
      count(*) FILTER (WHERE gac > now() - interval '12 months')::int AS acct_under_12mo
    FROM nu
  `))])

  // 3. shared-IP clusters among new users (same client_ip_hash)
  console.log('\n=== shared-IP clusters: >1 new user from the same client_ip_hash ===')
  console.table([...(await db.execute(sql`
    SELECT fs.client_ip_hash,
           count(DISTINCT u.id)::int AS new_users,
           count(DISTINCT coalesce(fs.country_code, fs.cf_country))::int AS countries
    FROM "user" u
    JOIN free_session fs ON fs.user_id = u.id
    WHERE u.created_at >= ${since} AND fs.client_ip_hash IS NOT NULL
    GROUP BY fs.client_ip_hash
    HAVING count(DISTINCT u.id) > 1
    ORDER BY new_users DESC LIMIT 25
  `))])

  // 4. composite suspect: referred + (dormant github OR referred-by-banned) + never ran agent
  console.log('\n=== composite suspects (referred, dormant/banned-referrer, never ran agent) ===')
  const suspects = [...(await db.execute(sql`
    WITH nu AS (SELECT id, email, created_at FROM "user" WHERE created_at >= ${since})
    SELECT nu.email, nu.created_at,
      EXISTS (SELECT 1 FROM referral r JOIN "user" ru ON ru.id=r.referrer_id AND ru.banned=true
              WHERE r.referred_id=nu.id) AS ref_by_banned,
      (SELECT ru.email FROM referral r JOIN "user" ru ON ru.id=r.referrer_id
              WHERE r.referred_id=nu.id LIMIT 1) AS referrer,
      qf.github_login,
      coalesce(qf.github_public_repos,0) AS repos,
      coalesce(qf.github_followers,0) AS followers,
      EXISTS (SELECT 1 FROM agent_run ar WHERE ar.user_id=nu.id) AS ran_agent
    FROM nu
    LEFT JOIN account a ON a."userId"=nu.id AND a.provider='github'
    LEFT JOIN referral_qualification qf ON qf.github_user_id=a."providerAccountId"
    WHERE EXISTS (SELECT 1 FROM referral r WHERE r.referred_id=nu.id)
      AND NOT EXISTS (SELECT 1 FROM agent_run ar WHERE ar.user_id=nu.id)
      AND (
        EXISTS (SELECT 1 FROM referral r JOIN "user" ru ON ru.id=r.referrer_id AND ru.banned=true WHERE r.referred_id=nu.id)
        OR (coalesce(qf.github_public_repos,0)=0 AND coalesce(qf.github_followers,0)=0)
      )
    ORDER BY ref_by_banned DESC, nu.created_at DESC
  `))]
  console.log(`(count: ${suspects.length})`)
  console.table(suspects.slice(0, 40))
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
