import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import { getChatAccessTier } from '@/server/chat/access'
import { getChatUserId } from '@/server/chat/auth'
import { CHAT_DISABLED, chatDisabledResponse } from '@/server/chat/disabled'
import { listThreads } from '@/server/chat/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (CHAT_DISABLED) {
    return chatDisabledResponse()
  }
  const userId = await getChatUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const [threads, accessTier] = await Promise.all([
    listThreads(userId),
    getChatAccessTier(userId, request),
  ])
  // Limited-access users are pinned to one model server-side; don't show
  // them a selector (or mention it) at all.
  return NextResponse.json({ threads, canSelectModel: accessTier === 'full' })
}
