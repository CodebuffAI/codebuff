import { NextResponse } from 'next/server'
import { z } from 'zod'

import { proxyCodebuffAdsRequest } from '../_helpers'

import type { NextRequest } from 'next/server'

const bodySchema = z.object({
  impUrl: z.url(),
  surface: z.enum(['chat', 'web']).optional(),
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
    pathname: '/api/v1/ads/click',
    fallbackBody: { success: false },
    body: {
      impUrl: parsed.data.impUrl,
      surface: parsed.data.surface ?? 'chat',
    },
  })
}
