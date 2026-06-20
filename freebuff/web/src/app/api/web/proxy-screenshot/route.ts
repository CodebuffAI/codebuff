import { NextRequest, NextResponse } from 'next/server'

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif)$/i

function isAllowedScreenshotUrl(url: URL): boolean {
  if (url.protocol !== 'https:') return false

  const hostname = url.hostname
  const r2Domain = process.env.R2_PUBLIC_DOMAIN

  if (r2Domain && hostname === r2Domain) return true
  if (hostname === 'screenshots.vly.ai') return true
  if (hostname.includes('screenshots')) return true
  if (IMAGE_EXTENSION_PATTERN.test(url.pathname)) return true

  return false
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url')
  if (!rawUrl) {
    return new NextResponse('Missing url', { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return new NextResponse('Invalid url', { status: 400 })
  }

  if (!isAllowedScreenshotUrl(parsed)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const upstream = await fetch(parsed.toString(), {
    next: { revalidate: 3600 },
  })

  if (!upstream.ok) {
    return new NextResponse('Upstream error', { status: upstream.status })
  }

  const buffer = await upstream.arrayBuffer()

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'image/png',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
