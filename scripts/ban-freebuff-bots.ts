import { readFileSync } from 'fs'

import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq, inArray, sql } from 'drizzle-orm'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const BAN_FILE =
  args[0] ?? '/Users/jahooma/codebuff/debug/freebuff-ban-candidates.txt'
const DRY_RUN = !process.argv.includes('--commit')

function parseEmails(path: string): string[] {
  const emails: string[] = []
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (!line || line.startsWith('#')) continue
    // Strip inline comments
    const code = line.split('#')[0].trim()
    if (!code) continue
    // The whole non-comment chunk IS the email (possibly with trailing whitespace)
    const email = code.trim()
    if (email.includes('@')) emails.push(email.toLowerCase())
  }
  return [...new Set(emails)]
}

async function main() {
  const emails = parseEmails(BAN_FILE)
  console.log(`parsed ${emails.length} distinct emails from ${BAN_FILE}`)

  // Look up users (case-insensitive match)
  const users = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      name: schema.user.name,
      banned: schema.user.banned,
      created_at: schema.user.created_at,
    })
    .from(schema.user)
    .where(
      sql`lower(${schema.user.email}) IN (${sql.join(
        emails.map((e) => sql`${e}`),
        sql`, `,
      )})`,
    )

  const foundEmails = new Set(users.map((u) => u.email.toLowerCase()))
  const missing = emails.filter((e) => !foundEmails.has(e))

  console.log(`matched ${users.length} users in DB`)
  if (missing.length) {
    console.log(`\nNOT FOUND in user table (${missing.length}):`)
    for (const e of missing) console.log(`  ${e}`)
  }

  const alreadyBanned = users.filter((u) => u.banned)
  const toBan = users.filter((u) => !u.banned)
  console.log(`\nalready banned: ${alreadyBanned.length}`)
  console.log(`will ban:       ${toBan.length}`)
  for (const u of toBan) {
    console.log(
      `  ${u.email.padEnd(40)} "${u.name ?? ''}" (created ${u.created_at.toISOString()})`,
    )
  }

  if (DRY_RUN) {
    console.log(
      `\nDRY RUN — pass --commit to actually set banned=true and delete free_session rows.`,
    )
    return
  }

  if (toBan.length === 0) {
    console.log('\nnothing to do.')
    return
  }

  const ids = toBan.map((u) => u.id)

  const updated = await db
    .update(schema.user)
    .set({ banned: true })
    .where(inArray(schema.user.id, ids))
    .returning({ id: schema.user.id, email: schema.user.email })

  console.log(`\n✅ banned ${updated.length} users`)

  // Also clear their free_session rows so admitted slots free up immediately
  const deleted = await db
    .delete(schema.freeSession)
    .where(inArray(schema.freeSession.user_id, ids))
    .returning({ user_id: schema.freeSession.user_id })

  console.log(`✅ deleted ${deleted.length} free_session rows`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
