/**
 * One-off: scan banned freebuff users for likely FALSE POSITIVES — accounts
 * with the real-coder fingerprint (high agent-step coverage, no proxy fanout,
 * full subagent hierarchy) that were swept into a ban.
 *
 * Key discriminator: a real freebuff coder only ever hits freebuff-family
 * models (deepseek / mimo / minimax / moonshot(kimi) / google-gemini). Using
 * a NON-freebuff model (claude / gpt / grok / glm-z.ai / relace / bytedance)
 * via the free endpoint is the premium-reselling tell and stays banned.
 *
 * NOT a clear: this scan ranks candidates; it does NOT auto-clear them. The
 * structural filter has its own false positives — a single-shot abuse script
 * (e.g. a chatbot/text-game backend hitting the endpoint once per "run") shows
 * msgs==runs yet still records one agent_step per call, so it passes the
 * step-coverage + freebuff-model gates. The `msgs/run` column and `1SHOT?` flag
 * below surface those; ALWAYS trace-confirm content with
 * inspect-freebuff-traces.ts before unbanning (see freebuff-abuse-detection.md).
 *
 * Read-only. Writes candidate emails to /tmp/fp-unban-candidates.txt.
 *   infisical run --env=prod --silent -- bun scripts/find-false-positive-bans.ts
 */
import db from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'
import { writeFileSync } from 'fs'

// A model id belongs to the freebuff offering iff its provider prefix is one of
// these. Everything else (anthropic/openai/x-ai/z-ai/relace/bytedance/raw-id)
// is a non-freebuff model => reselling signal.
const FREEBUFF_FAMILY = /^(deepseek|mimo|minimax|moonshotai|google)\//

async function main() {
  const r: any = await db.execute(sql`
    WITH bu AS (SELECT id, email, name, created_at FROM "user" WHERE banned=true),
    m AS (
      SELECT user_id, id, client_request_id, client_id, agent_id, model, finished_at
      FROM message WHERE user_id IN (SELECT id FROM bu)
    ),
    per_user AS (
      SELECT user_id, COUNT(*) msgs, COUNT(DISTINCT client_request_id) runs,
        COUNT(DISTINCT agent_id) distinct_agents, MAX(finished_at) last_at,
        ARRAY_AGG(DISTINCT model) models
      FROM m GROUP BY user_id
    ),
    steps AS (
      SELECT mm.user_id, COUNT(*) step_msgs
      FROM agent_step s JOIN m mm ON mm.id = s.message_id GROUP BY mm.user_id
    ),
    fanout AS (
      SELECT user_id, MAX(c) max_clients_per_run FROM (
        SELECT user_id, client_request_id, COUNT(DISTINCT client_id) c
        FROM m GROUP BY user_id, client_request_id
      ) z GROUP BY user_id
    )
    SELECT bu.email, bu.name, bu.created_at, pu.msgs, pu.runs, pu.distinct_agents,
           pu.models, COALESCE(st.step_msgs,0) step_msgs,
           ROUND(COALESCE(st.step_msgs,0)::numeric / NULLIF(pu.msgs,0), 3) step_cov,
           f.max_clients_per_run, pu.last_at
    FROM per_user pu
    JOIN bu ON bu.id = pu.user_id
    LEFT JOIN steps st ON st.user_id = pu.user_id
    LEFT JOIN fanout f ON f.user_id = pu.user_id
    ORDER BY pu.last_at DESC
  `)
  const rows: any[] = r.rows ?? r

  const usesNonFreebuff = (x: any) =>
    (x.models || []).some((mm: string) => !FREEBUFF_FAMILY.test(mm))

  // False positive: real freebuff coder swept into a ban.
  const isFP = (x: any) =>
    Number(x.step_cov) >= 0.9 &&
    Number(x.max_clients_per_run) <= 2 &&
    Number(x.distinct_agents) >= 3 &&
    !usesNonFreebuff(x)

  const fp = rows.filter(isFP)
  // Of the FP set, which used a premium-but-freebuff model (deepseek-pro / mimo-pro / kimi)?
  const PREMIUM = /(deepseek-v4-pro|mimo-v25-pro|mimo-v2\.5-pro|kimi)/i

  // Single-shot bulk fingerprint: ~one message per run. A real coding session
  // is a multi-step agent loop (msgs >> runs); msgs≈runs is scripted abuse
  // (chatbot/game backend) even when step-coverage is high. Flag, don't drop.
  const msgsPerRun = (x: any) => Number(x.msgs) / Math.max(1, Number(x.runs))
  const isSingleShot = (x: any) => msgsPerRun(x) < 1.3

  console.log(`banned-with-msgs: ${rows.length}`)
  console.log(`LIKELY FALSE POSITIVE (freebuff-only real coder): ${fp.length}`)
  console.log(`  of which 1SHOT? (msgs≈runs — trace-confirm, likely still abuse): ${fp.filter(isSingleShot).length}`)
  console.log('\n=== FALSE POSITIVES (sorted by last activity) — trace-confirm before unbanning ===')
  console.log('last_at\t\tmsgs\truns\tm/run\tag\tcov\tmaxCli\tcreated\t\tprem?\t1SHOT?\tname\tmodels')
  for (const x of fp) {
    const prem = (x.models || []).some((mm: string) => PREMIUM.test(mm)) ? 'Y' : ''
    console.log(
      `${new Date(x.last_at).toISOString().slice(0, 16)}\t${x.msgs}\t${x.runs}\t${msgsPerRun(x).toFixed(1)}\t${x.distinct_agents}\t${x.step_cov}\t${x.max_clients_per_run}\t${new Date(x.created_at).toISOString().slice(0, 10)}\t${prem}\t${isSingleShot(x) ? 'SHOT' : ''}\t${x.name ?? ''}\t${(x.models || []).map((mm: string) => mm.split('/')[1] ?? mm).join(',')}`,
    )
  }
  // Only the multi-step candidates go to the unban file; 1SHOT ones need a human.
  const cleared = fp.filter((x) => !isSingleShot(x))
  writeFileSync('/tmp/fp-unban-candidates.txt', cleared.map((x) => x.email).join('\n') + '\n')
  console.log(`\nwrote ${cleared.length} multi-step candidate emails to /tmp/fp-unban-candidates.txt`)
  console.log(`(${fp.filter(isSingleShot).length} single-shot candidates held back — review traces by hand)`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
