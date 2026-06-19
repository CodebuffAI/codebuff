import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'

import { gravityAds } from '@gravity-ai/api'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

import type { NextRequest } from 'next/server'
import type {
  GravityContext,
  MessageObject,
  PlacementObject,
} from '@gravity-ai/api'

const messageSchema = z.object({
  role: z.string(),
  content: z.string(),
})

const bodySchema = z.object({
  messages: z.array(messageSchema).optional().default([]),
  sessionId: z.string().optional(),
  gravity_context: z.record(z.string(), z.unknown()).optional(),
  surface: z.enum(['freebuff_web_chat', 'chat_assistant']).optional(),
  placementId: z.string().optional(),
})

function getPlacements(data: z.infer<typeof bodySchema>): PlacementObject[] {
  if (data.placementId === 'Above-iFrame') {
    return [{ placement: 'top_page', placement_id: 'Above-iFrame' }]
  }

  if (data.surface === 'chat_assistant') {
    return [
      {
        placement: 'inline_response',
        placement_id: 'Chat-Assistant-Above-Input',
      },
    ]
  }

  if (data.surface === 'freebuff_web_chat') {
    return [
      {
        placement: 'inline_response',
        placement_id: 'Web-Chat-After-User-Message',
      },
      {
        placement: 'inline_response',
        placement_id: 'Web-Chat-After-Assistant-Message',
      },
    ]
  }

  return [
    {
      placement: 'below_response',
      placement_id: data.placementId ?? 'Single-Ad-Unit-1',
    },
  ]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function withTrustedUserContext(
  data: z.infer<typeof bodySchema>,
  userId: string,
): GravityContext {
  const context = isRecord(data.gravity_context) ? data.gravity_context : {}
  const user = isRecord(context.user) ? context.user : {}

  return {
    ...context,
    sessionId:
      typeof context.sessionId === 'string'
        ? context.sessionId
        : data.sessionId ?? userId,
    user: {
      ...user,
      id: userId,
      userId,
    },
    device: isRecord(context.device) ? context.device : {},
  } as GravityContext
}

function normalizeGravityAd(ad: Record<string, unknown>) {
  return {
    ...ad,
    placementId:
      typeof ad.placementId === 'string'
        ? ad.placementId
        : typeof ad.placement_id === 'string'
          ? ad.placement_id
          : undefined,
  }
}

function toGravitySdkMessages(
  messages: z.infer<typeof bodySchema>['messages'],
): MessageObject[] {
  return messages.flatMap((message) => {
    if (message.role !== 'user' && message.role !== 'assistant') return []
    return [{ role: message.role, content: message.content }]
  })
}

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.format() },
      { status: 400 },
    )
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const messages = toGravitySdkMessages(parsed.data.messages)
  const body = {
    messages,
    sessionId: parsed.data.sessionId,
    gravity_context: withTrustedUserContext(parsed.data, session.user.id),
  }

  const result = await gravityAds(
    {
      body,
      headers: Object.fromEntries(request.headers.entries()),
    },
    messages,
    getPlacements(parsed.data),
    {
      production: true,
      relevancy: 0,
    },
  )

  if (result.error) {
    logger.warn(
      {
        status: result.status,
        elapsed: result.elapsed,
        error: result.error,
      },
      'Gravity SDK ad request failed',
    )
  }

  return NextResponse.json({
    ads: result.ads.map((ad) =>
      normalizeGravityAd(ad as unknown as Record<string, unknown>),
    ),
    provider: 'gravity',
  })
}
