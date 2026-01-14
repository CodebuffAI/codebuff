import * as schema from '@codebuff/internal/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

import type { CodebuffPgDatabase } from '@codebuff/internal/db/types'

export type FingerprintData = { created_at: Date; sig_hash: string | null }

export interface LogoutDb {
  getSessionByToken(token: string, userId: string): Promise<{ userId: string }[]>
  deleteSessionsByFingerprint(userId: string, fingerprintId: string): Promise<{ id: string }[]>
  getFingerprintData(fingerprintId: string): Promise<FingerprintData[]>
  deleteOrphanedWebSessions(userId: string): Promise<{ id: string }[]>
  deleteAllWebSessions(userId: string): Promise<{ id: string }[]>
  unclaimFingerprint(fingerprintId: string): Promise<void>
}

export function createLogoutDb(db: CodebuffPgDatabase): LogoutDb {
  return {
    getSessionByToken: (token, userId) =>
      db
        .select({ userId: schema.session.userId })
        .from(schema.session)
        .where(and(eq(schema.session.sessionToken, token), eq(schema.session.userId, userId)))
        .limit(1),

    deleteSessionsByFingerprint: (userId, fingerprintId) =>
      db
        .delete(schema.session)
        .where(and(eq(schema.session.userId, userId), eq(schema.session.fingerprint_id, fingerprintId)))
        .returning({ id: schema.session.sessionToken }),

    getFingerprintData: (fingerprintId) =>
      db
        .select({ created_at: schema.fingerprint.created_at, sig_hash: schema.fingerprint.sig_hash })
        .from(schema.fingerprint)
        .where(eq(schema.fingerprint.id, fingerprintId))
        .limit(1),

    deleteOrphanedWebSessions: (userId) =>
      db
        .delete(schema.session)
        .where(
          and(
            eq(schema.session.userId, userId),
            eq(schema.session.type, 'web'),
            isNull(schema.session.fingerprint_id),
          ),
        )
        .returning({ id: schema.session.sessionToken }),

    deleteAllWebSessions: (userId) =>
      db
        .delete(schema.session)
        .where(and(eq(schema.session.userId, userId), eq(schema.session.type, 'web')))
        .returning({ id: schema.session.sessionToken }),

    unclaimFingerprint: async (fingerprintId) => {
      await db
        .update(schema.fingerprint)
        .set({ sig_hash: null })
        .where(eq(schema.fingerprint.id, fingerprintId))
    },
  }
}
