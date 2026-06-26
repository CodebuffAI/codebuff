import { timingSafeEqual } from 'crypto'

import { env } from '@codebuff/internal/env'
import { NextResponse } from 'next/server'

import { CHAT_DOC_RETENTION_DAYS } from '@/app/chat/models'
import { runAttachmentSweep } from '@/server/chat/attachment-sweep'
import { getBlobStore } from '@/server/chat/blob-store'
import {
  clearMessageAttachments,
  listExpiredAttachmentMessages,
} from '@/server/chat/store'
import { logger } from '@/util/logger'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
// Deletes blobs and updates rows in batches; give it room beyond the default.
export const maxDuration = 120

// Messages processed per DB round-trip, and a hard cap on batches per call so a
// single invocation stays bounded (a daily cron easily drains the backlog).
const BATCH_SIZE = 500
const MAX_BATCHES = 20

/**
 * Chat-attachment-sweep endpoint, called on a schedule by the
 * chat-attachment-sweep GitHub Action. Reclaims storage by deleting the
 * extracted-text blobs of document attachments older than
 * CHAT_DOC_RETENTION_DAYS, then clearing those messages' `attachments` refs so
 * the sweep is idempotent and no dangling refs remain. Conversation content is
 * untouched — only now-dead blob references go away, and the chat loaders
 * already skip missing blobs gracefully.
 *
 * Auth: static bearer token from CHAT_ATTACHMENT_SWEEP_SECRET — lets CI call the
 * endpoint without a NextAuth session and keeps prod DATABASE_URL out of GitHub
 * secrets (mirrors /api/admin/referral-sweep).
 */
export async function POST(req: NextRequest) {
  const secret = env.CHAT_ATTACHMENT_SWEEP_SECRET
  if (!secret) {
    return NextResponse.json(
      {
        error:
          'chat-attachment-sweep not configured (CHAT_ATTACHMENT_SWEEP_SECRET missing)',
      },
      { status: 503 },
    )
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const expected = `Bearer ${secret}`
  const a = Buffer.from(authHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(
    Date.now() - CHAT_DOC_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  )
  try {
    const blobStore = getBlobStore()
    const result = await runAttachmentSweep(
      {
        listExpired: listExpiredAttachmentMessages,
        deleteBlobs: (ids) => blobStore.deleteMany(ids),
        clearRefs: clearMessageAttachments,
      },
      { cutoff, batchSize: BATCH_SIZE, maxBatches: MAX_BATCHES },
    )
    const payload = { ...result, retentionDays: CHAT_DOC_RETENTION_DAYS }
    logger.info(payload, 'chat-attachment-sweep complete')
    return NextResponse.json({ ok: true, ...payload })
  } catch (error) {
    logger.error({ error }, 'chat-attachment-sweep failed')
    return NextResponse.json({ error: 'sweep failed' }, { status: 500 })
  }
}
