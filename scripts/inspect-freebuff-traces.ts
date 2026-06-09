/**
 * Inspect actual stored traces (request/response) for given Freebuff users to
 * judge whether their traffic is real coding via the CLI/agent loop or raw
 * proxy/farm passthrough of the free chat-completions endpoint.
 *
 * Read-only. Usage:
 *   infisical run --env=prod --silent -- bun scripts/inspect-freebuff-traces.ts email1 email2 ...
 *   infisical run --env=prod --silent -- bun scripts/inspect-freebuff-traces.ts --samples 4 a@b.com
 */
import db from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(name)
  if (i < 0) return def
  const v = Number.parseInt(process.argv[i + 1] ?? '', 10)
  return Number.isFinite(v) ? v : def
}

const samples = arg('--samples', 3)
const emails = process.argv.slice(2).filter((a) => a.includes('@'))

function txt(v: unknown, n = 220): string {
  let s = typeof v === 'string' ? v : JSON.stringify(v)
  if (!s) return ''
  s = s.replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n) + '…' : s
}

// Pull a readable summary out of an OpenAI-style request messages array.
function summarizeRequest(request: unknown): {
  msgCount: number
  roles: string
  system: string
  firstUser: string
  lastUser: string
} {
  const arr = Array.isArray(request) ? request : []
  const roleOf = (m: any) => (m && typeof m === 'object' ? m.role : undefined)
  const contentOf = (m: any) => {
    if (!m || typeof m !== 'object') return ''
    if (typeof m.content === 'string') return m.content
    if (Array.isArray(m.content))
      return m.content
        .map((c: any) => (typeof c === 'string' ? c : c?.text ?? ''))
        .join(' ')
    return JSON.stringify(m.content)
  }
  const system = arr.find((m: any) => roleOf(m) === 'system')
  const users = arr.filter((m: any) => roleOf(m) === 'user')
  return {
    msgCount: arr.length,
    roles: arr.map(roleOf).join(','),
    system: txt(contentOf(system), 300),
    firstUser: txt(contentOf(users[0]), 300),
    lastUser: txt(contentOf(users[users.length - 1]), 300),
  }
}

function summarizeResponse(response: unknown): string {
  const r: any = response
  if (typeof r === 'string') return txt(r)
  // OpenAI chat completion shape
  const choice = r?.choices?.[0]?.message?.content ?? r?.content ?? r?.text
  if (choice) return txt(choice)
  return txt(r)
}

async function main() {
  for (const email of emails) {
    const urows: any = await db.execute(
      sql`SELECT id, email, banned, created_at FROM "user" WHERE email = ${email} LIMIT 1`,
    )
    const u = (Array.isArray(urows) ? urows : urows.rows ?? [])[0]
    console.log('\n' + '='.repeat(110))
    if (!u) {
      console.log(`NO USER FOUND for ${email}`)
      continue
    }
    console.log(
      `USER ${email}  id=${u.id}  banned=${u.banned}  created=${u.created_at}`,
    )

    // Aggregate: distinct repo_urls, agents, models, has-any-agent-step
    const agg: any = await db.execute(sql`
      WITH m AS (
        SELECT * FROM message WHERE user_id = ${u.id}
      )
      SELECT
        COUNT(*)::int AS msgs,
        COUNT(DISTINCT client_request_id)::int AS runs,
        COUNT(DISTINCT client_id)::int AS clients,
        COUNT(*) FILTER (WHERE repo_url IS NOT NULL AND repo_url <> '')::int AS with_repo,
        COUNT(DISTINCT repo_url)::int AS distinct_repos,
        ARRAY_AGG(DISTINCT agent_id) AS agents,
        ARRAY_AGG(DISTINCT model) AS models,
        MIN(finished_at) AS first_at,
        MAX(finished_at) AS last_at
      FROM m
    `)
    const a = (Array.isArray(agg) ? agg : agg.rows ?? [])[0]
    const stepRows: any = await db.execute(sql`
      SELECT COUNT(*)::int AS step_msgs
      FROM agent_step s
      WHERE s.message_id IN (SELECT id FROM message WHERE user_id = ${u.id})
    `)
    const stepMsgs = (Array.isArray(stepRows) ? stepRows : stepRows.rows ?? [])[0]
      ?.step_msgs
    const repoSample: any = await db.execute(sql`
      SELECT DISTINCT repo_url FROM message
      WHERE user_id = ${u.id} AND repo_url IS NOT NULL AND repo_url <> ''
      LIMIT 8
    `)
    const repos = (Array.isArray(repoSample) ? repoSample : repoSample.rows ?? [])
      .map((r: any) => r.repo_url)
    console.log(
      `  msgs=${a.msgs} runs=${a.runs} clients=${a.clients} with_repo=${a.with_repo} distinct_repos=${a.distinct_repos} msgs_with_agent_step=${stepMsgs}`,
    )
    console.log(`  agents=${(a.agents || []).join(', ')}`)
    console.log(`  models=${(a.models || []).join(', ')}`)
    console.log(`  repos=${repos.length ? repos.join(' | ') : '(none)'}`)
    console.log(`  span=${a.first_at} .. ${a.last_at}`)

    // Sample raw traces
    const rows: any = await db.execute(sql`
      SELECT id, model, agent_id, repo_url, client_id, client_request_id,
             request, response, input_tokens, output_tokens, finished_at
      FROM message
      WHERE user_id = ${u.id}
      ORDER BY finished_at DESC
      LIMIT ${samples}
    `)
    const list = Array.isArray(rows) ? rows : rows.rows ?? []
    for (const m of list) {
      const req = summarizeRequest(m.request)
      console.log(`  --- trace ${m.id} ${m.finished_at} ---`)
      console.log(
        `    model=${m.model} agent=${m.agent_id} repo=${m.repo_url ?? '(none)'} in=${m.input_tokens} out=${m.output_tokens}`,
      )
      console.log(`    reqMsgs=${req.msgCount} roles=[${req.roles}]`)
      console.log(`    system: ${req.system || '(none)'}`)
      console.log(`    firstUser: ${req.firstUser || '(none)'}`)
      console.log(`    lastUser: ${req.lastUser || '(none)'}`)
      console.log(`    response: ${summarizeResponse(m.response)}`)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
