import crypto from 'crypto'

import { env } from '@codebuff/internal/env'
import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import type { NextRequest } from 'next/server'

import { logger } from '@/util/logger'

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function POST(request: NextRequest) {
  const secretKey = env.TURNSTILE_SECRET_KEY
  if (!secretKey) {
    return NextResponse.json({ success: true })
  }

  const body = await request.json()
  const parsed = z.object({ token: z.string().min(1) }).safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid token' },
      { status: 400 },
    )
  }

  const formData = new FormData()
  formData.append('secret', secretKey)
  formData.append('response', parsed.data.token)

  const ip =
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For') ??
    ''
  if (ip) {
    formData.append('remoteip', ip)
  }

  const result = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    body: formData,
  })
  const outcome = (await result.json()) as {
    success: boolean
    'error-codes'?: string[]
  }

  if (!outcome.success) {
    logger.warn(
      { errorCodes: outcome['error-codes'] },
      'Turnstile verification failed',
    )
    return NextResponse.json(
      { success: false, error: 'Verification failed' },
      { status: 403 },
    )
  }

  const timestamp = Date.now().toString()
  const signature = crypto
    .createHmac('sha256', env.NEXTAUTH_SECRET)
    .update(timestamp)
    .digest('hex')

  const response = NextResponse.json({ success: true })
  response.cookies.set('turnstile_verified', `${timestamp}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  })

  return response
}
