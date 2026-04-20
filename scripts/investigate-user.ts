import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { sql, eq, desc } from 'drizzle-orm'

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('usage: bun scripts/investigate-user.ts <email>')
    process.exit(1)
  }

  const users = await db
    .select()
    .from(schema.user)
    .where(sql`lower(${schema.user.email}) = ${email.toLowerCase()}`)

  if (users.length === 0) {
    console.log('user not found')
    return
  }
  const u = users[0]
  console.log('=== user ===')
  console.log(JSON.stringify({
    id: u.id,
    email: u.email,
    name: u.name,
    handle: u.handle,
    banned: u.banned,
    created_at: u.created_at,
    emailVerified: u.emailVerified,
    image: u.image,
  }, null, 2))

  const accounts = await db
    .select()
    .from(schema.account)
    .where(eq(schema.account.userId, u.id))
  console.log('\n=== accounts ===')
  for (const a of accounts) {
    console.log(`  provider=${a.provider}  providerAccountId=${a.providerAccountId}  scope=${a.scope ?? ''}`)
  }

  const stats = await db
    .select({
      agent_id: schema.message.agent_id,
      count: sql<number>`COUNT(*)`,
      totalCost: sql<number>`SUM(${schema.message.cost})`,
      first: sql<string>`MIN(${schema.message.finished_at})`,
      last: sql<string>`MAX(${schema.message.finished_at})`,
    })
    .from(schema.message)
    .where(eq(schema.message.user_id, u.id))
    .groupBy(schema.message.agent_id)
  console.log('\n=== messages by agent ===')
  for (const s of stats) {
    console.log(`  ${s.agent_id}: ${s.count} msgs, $${Number(s.totalCost).toFixed(2)}, ${s.first} → ${s.last}`)
  }

  const repos = await db
    .select({
      repo_url: schema.message.repo_url,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.message)
    .where(eq(schema.message.user_id, u.id))
    .groupBy(schema.message.repo_url)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(20)
  console.log('\n=== repos touched ===')
  for (const r of repos) {
    console.log(`  ${r.count.toString().padStart(5)}  ${r.repo_url ?? '(null)'}`)
  }

  const sample = await db
    .select({
      finished_at: schema.message.finished_at,
      agent_id: schema.message.agent_id,
      repo_url: schema.message.repo_url,
      input_tokens: schema.message.input_tokens,
      output_tokens: schema.message.output_tokens,
      cost: schema.message.cost,
      lastMessage: schema.message.lastMessage,
    })
    .from(schema.message)
    .where(eq(schema.message.user_id, u.id))
    .orderBy(desc(schema.message.finished_at))
    .limit(5)
  console.log('\n=== 5 most recent messages (last user turn) ===')
  for (const m of sample) {
    console.log(`\n  ${m.finished_at.toISOString()}  agent=${m.agent_id}  repo=${m.repo_url ?? ''}  in=${m.input_tokens} out=${m.output_tokens} cost=$${Number(m.cost).toFixed(4)}`)
    const msg = m.lastMessage as any
    const content = typeof msg?.content === 'string' ? msg.content : JSON.stringify(msg?.content)?.slice(0, 500)
    console.log(`    role=${msg?.role}  content=${(content ?? '').slice(0, 500)}`)
  }

  // Session/CLI usage
  const sessions = await db
    .select({
      type: schema.session.type,
      created_at: schema.session.created_at,
      fingerprint_id: schema.session.fingerprint_id,
    })
    .from(schema.session)
    .where(eq(schema.session.userId, u.id))
    .orderBy(desc(schema.session.created_at))
    .limit(10)
  console.log('\n=== recent sessions ===')
  for (const s of sessions) {
    console.log(`  ${s.created_at.toISOString()}  type=${s.type}  fp=${s.fingerprint_id ?? ''}`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
