import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import { getChatUserId } from '@/server/chat/auth'
import { CHAT_DISABLED, chatDisabledResponse } from '@/server/chat/disabled'
import {
  deleteThread,
  getThread,
  listMessages,
  renameThread,
} from '@/server/chat/store'

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
  const messages = await listMessages(threadId)
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
  const deleted = await deleteThread(userId, threadId)
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
