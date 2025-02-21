import express from 'express'
import { z } from 'zod'
import { and, eq, gt } from 'drizzle-orm'
import { genAuthCode } from 'common/util/credentials'
import { env } from '@/env.mjs'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { logger } from '@/util/logger'

const router = express.Router()

// POST /api/auth/code
router.post('/code', async (req, res) => {
  const reqSchema = z.object({
    fingerprintId: z.string(),
    referralCode: z.string().optional(),
  })
  const result = reqSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid request body' })
  }

  const { fingerprintId, referralCode } = result.data

  try {
    // Insert fingerprint if not exists
    await db
      .insert(schema.fingerprint)
      .values({
        id: fingerprintId,
      })
      .onConflictDoNothing()

    const expiresAt = Date.now() + 60 * 60 * 1000 // 1 hour
    const fingerprintHash = genAuthCode(
      fingerprintId,
      expiresAt.toString(),
      env.NEXTAUTH_SECRET
    )

    const loginUrl = `${env.NEXT_PUBLIC_APP_URL}/login?auth_code=${fingerprintId}.${expiresAt}.${fingerprintHash}${
      referralCode ? `&referral_code=${referralCode}` : ''
    }`

    return res.json({ fingerprintId, fingerprintHash, loginUrl })
  } catch (error) {
    logger.error({ error }, 'Error generating login code')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/auth/status
router.get('/status', async (req, res) => {
  const reqSchema = z.object({
    fingerprintId: z.string(),
    fingerprintHash: z.string(),
  })
  const result = reqSchema.safeParse(req.query)
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid query parameters' })
  }

  const { fingerprintId, fingerprintHash } = result.data

  try {
    const users = await db
      .select({
        id: schema.user.id,
        email: schema.user.email,
        name: schema.user.name,
        authToken: schema.session.sessionToken,
      })
      .from(schema.user)
      .leftJoin(schema.session, eq(schema.user.id, schema.session.userId))
      .leftJoin(
        schema.fingerprint,
        eq(schema.session.fingerprint_id, schema.fingerprint.id)
      )
      .where(
        and(
          eq(schema.session.fingerprint_id, fingerprintId),
          eq(schema.fingerprint.sig_hash, fingerprintHash),
          gt(schema.session.expires, new Date()) // Only return active sessions
        )
      )

    if (users.length === 0) {
      return res.status(401).json({ error: 'Authentication failed' })
    }

    const user = users[0]
    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        authToken: user.authToken,
        fingerprintId,
        fingerprintHash,
      },
      message: 'Authentication successful!',
    })
  } catch (error) {
    logger.error({ error }, 'Error checking login status')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const reqSchema = z.object({
    authToken: z.string(),
    userId: z.string(),
    fingerprintId: z.string(),
    fingerprintHash: z.string(),
  })
  const result = reqSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid request body' })
  }

  const { authToken, userId, fingerprintId } = result.data

  try {
    const validDeletion = await db
      .delete(schema.session)
      .where(
        and(
          eq(schema.session.sessionToken, authToken),
          eq(schema.session.userId, userId),
          gt(schema.session.expires, new Date()),
          eq(schema.session.fingerprint_id, fingerprintId)
        )
      )
      .returning({
        id: schema.session.sessionToken,
      })

    if (validDeletion.length === 0) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    return res.json({ message: 'Logged out successfully' })
  } catch (error) {
    logger.error({ error }, 'Error logging out')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
