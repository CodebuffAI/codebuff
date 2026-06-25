import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import { getChatUserId } from '@/server/chat/auth'
import { getBlobStore, hydrateMessageImages } from '@/server/chat/blob-store'
import { CHAT_DISABLED, chatDisabledResponse } from '@/server/chat/disabled'
import {
  deleteThread,
  getThread,
  listMessages,
  listThreadBlobStorageIds,
  renameThread,
} from '@/server/chat/store'
import { logger } from '@/util/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ threadId: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  if (CHAT_DISABLED) {
    return chatDisabledResponse()
  }
  const userId = await getChatUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { threadId } = await params
  const thread = await getThread(userId, threadId)
  if (!thread) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const messages = await hydrateMessageImages(await listMessages(threadId))
  return NextResponse.json({ thread, messages })
}

export async function PATCH(request: NextRequest, { params }: Params) {
  if (CHAT_DISABLED) {
    return chatDisabledResponse()
  }
  const userId = await getChatUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { threadId } = await params
  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title || title.length > 200) {
    return NextResponse.json({ error: 'Invalid title' }, { status: 400 })
  }
  const thread = await renameThread(userId, threadId, title)
  if (!thread) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ thread })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  if (CHAT_DISABLED) {
    return chatDisabledResponse()
  }
  const userId = await getChatUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { threadId } = await params
  // Gather the thread's image blobs before deleting the rows (which cascades
  // the messages away). Only delete the blobs once we've confirmed the thread
  // was actually the user's and is now gone.
  const storageIds = await listThreadBlobStorageIds(threadId)
  const deleted = await deleteThread(userId, threadId)
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (storageIds.length > 0) {
    try {
      await getBlobStore().deleteMany(storageIds)
    } catch (error) {
      // Best-effort: the thread is gone either way. Orphaned blobs can be
      // swept later; don't fail the delete on a storage hiccup.
      logger.error(
        { error, threadId },
        'Chat image blob cleanup failed after thread delete',
      )
    }
  }
  return NextResponse.json({ ok: true })
}
