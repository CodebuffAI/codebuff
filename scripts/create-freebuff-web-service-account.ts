import { randomBytes } from 'node:crypto'

import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'

const SERVICE_EMAIL = 'freebuff-web-service@codebuff.internal'
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

async function main() {
  if (!process.argv.includes('--apply')) {
    console.log(
      'Dry run only. Re-run with --apply to create or rotate the Freebuff Web service credential.',
    )
    return
  }

  const [existingUser] = await db
    .select({ id: schema.user.id, email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.email, SERVICE_EMAIL))
    .limit(1)

  const user =
    existingUser ??
    (
      await db
        .insert(schema.user)
        .values({
          email: SERVICE_EMAIL,
          name: 'Freebuff Web Service',
          emailVerified: new Date(),
        })
        .returning({ id: schema.user.id, email: schema.user.email })
    )[0]

  if (!user) {
    throw new Error('Failed to create Freebuff Web service user')
  }

  // The account is dedicated to this integration, so rotating all of its PATs
  // makes a leaked previous credential stop working immediately.
  await db.delete(schema.session).where(eq(schema.session.userId, user.id))

  const apiKey = `cb-pat-${randomBytes(32).toString('hex')}`
  await db.insert(schema.session).values({
    sessionToken: apiKey,
    userId: user.id,
    expires: new Date(Date.now() + ONE_YEAR_MS),
    fingerprint_id: null,
    type: 'pat',
  })

  console.log('Created and rotated the dedicated Freebuff Web service account.')
  console.log(`FREEBUFF_WEB_SERVICE_USER_ID=${user.id}`)
  console.log(`CODEBUFF_API_KEY=${apiKey}`)
  console.log(
    '\nSet FREEBUFF_WEB_SERVICE_USER_ID only on the Codebuff API server. Set CODEBUFF_API_KEY only in the Freebuff Web Convex deployment.',
  )
}

await main()
