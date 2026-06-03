import { NextResponse } from 'next/server'
import { z } from 'zod'

import { proxyCodebuffAdsRequest } from './_helpers'

import type { NextRequest } from 'next/server'

const messageSchema = z.object({
  role: z.string(),
  content: z.string(),
})

const bodySchema = z.object({
  messages: z.array(messageSchema).optional().default([]),
  sessionId: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.format() },
      { status: 400 },
    )
  }

  return proxyCodebuffAdsRequest({
    request,
    pathname: '/api/v1/ads',
    fallbackBody: { ads: [], provider: 'gravity' },
    body: {
      provider: 'gravity',
      messages: parsed.data.messages,
      sessionId: parsed.data.sessionId,
      userAgent: request.headers.get('user-agent') ?? undefined,
    },
  })
}
