import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'

export async function getUserIdFromAuthToken(authToken: string): Promise<string | undefined> {
  const user = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .leftJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .where(eq(schema.session.sessionToken, authToken))
    .limit(1)
    .then(rows => rows[0])

  return user?.id
}