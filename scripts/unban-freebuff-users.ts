/**
 * Reverse of ban-freebuff-bots.ts: sets banned=false for users listed in a
 * file. Does NOT restore free_session rows (those rebuild themselves on the
 * next CLI /session request).
 *
 * usage:   bun scripts/unban-freebuff-users.ts <path> [--commit]
 */

import { readFileSync } from 'fs'

import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { inArray, sql } from 'drizzle-orm'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const FILE = args[0]
const DRY_RUN = !process.argv.includes('--commit')

if (!FILE) {
  console.error('usage: bun scripts/unban-freebuff-users.ts <path> [--commit]')
  process.exit(1)
}

function parseEmails(path: string): string[] {
  const out: string[] = []
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (!line || line.startsWith('#')) continue
    const code = line.split('#')[0].trim()
    if (!code) continue
    if (code.includes('@')) out.push(code.toLowerCase())
  }
  return [...new Set(out)]
}

async function main() {
  const emails = parseEmails(FILE)
  console.log(`parsed ${emails.length} distinct emails from ${FILE}`)

  const users = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      name: schema.user.name,
      banned: schema.user.banned,
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
  if (missing.length) {
    console.log(`\nNOT FOUND in user table (${missing.length}):`)
    for (const e of missing) console.log(`  ${e}`)
  }

  const alreadyUnbanned = users.filter((u) => !u.banned)
  const toUnban = users.filter((u) => u.banned)
  console.log(`\nalready unbanned: ${alreadyUnbanned.length}`)
  console.log(`will unban:       ${toUnban.length}`)
  for (const u of toUnban) {
    console.log(`  ${u.email.padEnd(40)} "${u.name ?? ''}"`)
  }

  if (DRY_RUN) {
    console.log(`\nDRY RUN — pass --commit to actually set banned=false.`)
    return
  }

  if (toUnban.length === 0) {
    console.log('\nnothing to do.')
    return
  }

  const ids = toUnban.map((u) => u.id)
  const updated = await db
    .update(schema.user)
    .set({ banned: false })
    .where(inArray(schema.user.id, ids))
    .returning({ id: schema.user.id, email: schema.user.email })

  console.log(`\n✅ unbanned ${updated.length} users`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
