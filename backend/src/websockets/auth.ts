import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'

export interface UserInfo {
  id: string
  email: string
  discord_id: string | null
}

export async function getUserIdFromAuthToken(
  authToken: string,
): Promise<string | undefined> {
  const user = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .leftJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .where(eq(schema.session.sessionToken, authToken))
    .limit(1)
    .then((rows) => rows[0])

  return user?.id
}

export async function getUserInfoFromAuthToken(
  authToken: string,
): Promise<UserInfo | undefined> {
  // Test-only bypass for remote evals
  if (process.env.NODE_ENV === 'test') {
    const bypass = process.env.CODEBUFF_TEST_AUTH_TOKEN
    if (bypass && authToken === bypass) {
      return {
        id: 'test-user',
        email: 'evals@test.local',
        discord_id: null,
      }
    }
  }

  const user = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      discord_id: schema.user.discord_id,
    })
    .from(schema.user)
    .leftJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .where(eq(schema.session.sessionToken, authToken))
    .limit(1)
    .then((rows) => rows[0])

  return user ?? undefined
}
