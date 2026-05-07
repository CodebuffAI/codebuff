import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { sql } from 'drizzle-orm'

async function main() {
  const emails = process.argv.slice(2).map((e) => e.toLowerCase())
  if (!emails.length) { console.error('usage: bun scripts/unban-user.ts <email> [<email> ...]'); process.exit(1) }

  const res = await db
    .update(schema.user)
    .set({ banned: false })
    .where(sql`lower(${schema.user.email}) IN (${sql.join(emails.map((e) => sql`${e}`), sql`, `)})`)
    .returning({ id: schema.user.id, email: schema.user.email, banned: schema.user.banned })

  console.log(`unbanned ${res.length} users:`)
  for (const r of res) console.log(`  ${r.email}`)
  const missing = emails.filter((e) => !res.some((r) => r.email.toLowerCase() === e))
  if (missing.length) { console.log(`\nno match for:`); for (const m of missing) console.log(`  ${m}`) }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
