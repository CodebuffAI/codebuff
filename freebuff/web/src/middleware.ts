import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

const COOKIE_MAX_AGE_MS = 5 * 60 * 1000 // 5 minutes

async function verifyHmac(
  timestamp: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(timestamp))
  const expected = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return expected === signature
}

export async function middleware(request: NextRequest) {
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY
  const nextauthSecret = process.env.NEXTAUTH_SECRET

  if (!turnstileSecret || !nextauthSecret) {
    return NextResponse.next()
  }

  const cookie = request.cookies.get('turnstile_verified')?.value
  if (!cookie) {
    const loginUrl = new URL('/login', request.url)
    request.nextUrl.searchParams.forEach((value, key) => {
      loginUrl.searchParams.set(key, value)
    })
    return NextResponse.redirect(loginUrl)
  }

  const [timestamp, signature] = cookie.split('.')
  if (!timestamp || !signature) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  const age = Date.now() - parseInt(timestamp, 10)
  if (isNaN(age) || age > COOKIE_MAX_AGE_MS) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  const valid = await verifyHmac(timestamp, signature, nextauthSecret)
  if (!valid) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/auth/signin/:path*'],
}
