import { and, eq, gt, isNull } from 'drizzle-orm'
import { cookies } from 'next/headers'

import { MAX_DATE } from '@codebuff/common/old-constants'
import { db } from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'

import { logger } from '@/util/logger'

type DbTransaction = Parameters<typeof db.transaction>[0] extends (
  tx: infer T,
) => any
  ? T
  : never

export async function checkReplayAttack(
  fingerprintHash: string,
  userId: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .leftJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .leftJoin(
      schema.fingerprint,
      eq(schema.session.fingerprint_id, schema.fingerprint.id),
    )
    .where(
      and(
        eq(schema.fingerprint.sig_hash, fingerprintHash),
        eq(schema.user.id, userId),
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
      expires: schema.session.expires,
    })
    .from(schema.session)
    .where(
      and(
        eq(schema.session.fingerprint_id, fingerprintId),
        gt(schema.session.expires, new Date()),
      ),
    )
    .limit(1)

  const activeSession = existingSession[0]
  if (activeSession && activeSession.userId !== userId) {
    return { hasConflict: true, existingUserId: activeSession.userId }
  }
  return { hasConflict: false }
}

export async function getSessionTokenFromCookies(): Promise<string | undefined> {
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
      .values({ sig_hash: fingerprintHash, id: fingerprintId })
      .onConflictDoNothing()

    const session = await tx
      .insert(schema.session)
      .values({
        sessionToken: crypto.randomUUID(),
        userId,
        expires: MAX_DATE,
        fingerprint_id: fingerprintId,
        type: 'cli',
      })
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
