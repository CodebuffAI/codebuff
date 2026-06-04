import { env } from '@codebuff/internal/env'
import { getServerSession } from 'next-auth'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'

import type { NextRequest } from 'next/server'

export async function getCurrentSessionTokenFromCookies(): Promise<
  string | null
> {
  const jar = await cookies()
  const names = [
    'authjs.session-token',
    '__Secure-next-auth.session-token',
    'next-auth.session-token',
  ]

  for (const name of names) {
    const value = jar.get(name)?.value
    if (value) return value
  }

  return null
}

export async function proxyCodebuffAdsRequest(params: {
  request: NextRequest
  pathname: string
  body: unknown
  fallbackBody?: unknown
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sessionToken = await getCurrentSessionTokenFromCookies()
  if (!sessionToken) {
    return NextResponse.json(params.fallbackBody ?? { success: false })
  }

  const url = new URL(params.pathname, env.NEXT_PUBLIC_CODEBUFF_APP_URL)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      ...(params.request.headers.get('user-agent')
        ? { 'User-Agent': params.request.headers.get('user-agent')! }
        : {}),
    },
    body: JSON.stringify(params.body),
  })

  if (!response.ok) {
    return NextResponse.json(params.fallbackBody ?? { success: false })
  }

  return NextResponse.json(await response.json())
}
