import { MAX_DATE } from '@codebuff/common/old-constants'
import { db } from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, eq, gt, isNull, ne } from 'drizzle-orm'
import { cookies } from 'next/headers'

import { logger } from '@/util/logger'

type DbTransaction = Parameters<typeof db.transaction>[0] extends (
  tx: infer T,
) => any
  ? T
  : never

export async function hasCliSessionForAuthHash(
  fingerprintHash: string,
  userId: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: schema.session.userId })
    .from(schema.session)
    .where(
      and(
        eq(schema.session.cli_auth_hash, fingerprintHash),
        eq(schema.session.userId, userId),
        eq(schema.session.type, 'cli'),
        gt(schema.session.expires, new Date()),
      ),
    )
    .limit(1)

  return existing.length > 0
}

export async function checkFingerprintConflict(
  fingerprintId: string,
  userId: string,
): Promise<{ hasConflict: boolean; existingUserId?: string }> {
  const existingSession = await db
    .select({
      userId: schema.session.userId,
    })
    .from(schema.session)
    .where(
      and(
        eq(schema.session.fingerprint_id, fingerprintId),
        ne(schema.session.userId, userId),
        gt(schema.session.expires, new Date()),
      ),
    )
    .limit(1)

  const activeSession = existingSession[0]
  if (activeSession) {
    return { hasConflict: true, existingUserId: activeSession.userId }
  }
  return { hasConflict: false }
}

export async function getSessionTokenFromCookies(): Promise<
  string | undefined
> {
  const cookieStore = await cookies()
  return (
    cookieStore.get('authjs.session-token')?.value ??
    cookieStore.get('__Secure-next-auth.session-token')?.value ??
    cookieStore.get('next-auth.session-token')?.value
  )
}

export async function createCliSession(
  userId: string,
  fingerprintId: string,
  fingerprintHash: string,
  sessionToken?: string,
): Promise<boolean> {
  return db.transaction(async (tx: DbTransaction) => {
    await tx
      .insert(schema.fingerprint)
      .values({ id: fingerprintId })
      .onConflictDoNothing()

    const session = await tx
      .insert(schema.session)
      .values({
        sessionToken: crypto.randomUUID(),
        userId,
        expires: MAX_DATE,
        fingerprint_id: fingerprintId,
        cli_auth_hash: fingerprintHash,
        type: 'cli',
      })
      .onConflictDoNothing()
      .returning({ userId: schema.session.userId })

    if (sessionToken) {
      await tx
        .update(schema.session)
        .set({ fingerprint_id: fingerprintId })
        .where(
          and(
            eq(schema.session.sessionToken, sessionToken),
            eq(schema.session.userId, userId),
            isNull(schema.session.fingerprint_id),
            eq(schema.session.type, 'web'),
          ),
        )
    } else {
      logger.warn(
        { fingerprintId, userId },
        'No session token found, cannot link web session to fingerprint',
      )
    }

    return session.length > 0
  })
}
