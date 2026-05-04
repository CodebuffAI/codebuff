import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, eq, gt } from 'drizzle-orm'

export interface LoginStatusUser {
  id: string
  email: string | null
  name: string | null
  authToken: string
}

export interface LoginStatusDb {
  getCliSessionForAuth(
    fingerprintId: string,
    fingerprintHash: string,
  ): Promise<LoginStatusUser | null>
}

export function createLoginStatusDb(): LoginStatusDb {
  return {
    getCliSessionForAuth: async (fingerprintId, fingerprintHash) => {
      const users = await db
        .select({
          id: schema.user.id,
          email: schema.user.email,
          name: schema.user.name,
          authToken: schema.session.sessionToken,
        })
        .from(schema.session)
        .innerJoin(schema.user, eq(schema.session.userId, schema.user.id))
        .where(
          and(
            eq(schema.session.fingerprint_id, fingerprintId),
            eq(schema.session.cli_auth_hash, fingerprintHash),
            eq(schema.session.type, 'cli'),
            gt(schema.session.expires, new Date()),
          ),
        )
        .limit(1)

      return users[0] ?? null
    },
  }
}
