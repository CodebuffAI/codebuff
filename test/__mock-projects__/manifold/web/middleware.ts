import { NextResponse, type NextRequest } from 'next/server'
import { fetchBackend } from './lib/api/proxy'

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname.replace('/api/', '')

  if (pathsToSkip.includes(path)) {
    return NextResponse.next()
  }

  try {
    return await fetchBackend(req, path)
  } catch (err) {
    console.error('Error talking to cloud function: ', err)
    return new Response('Error communicating with backend', { status: 500 })
  }
}

export const config = {
  matcher: ['/api/v0/:path*'],
}

const pathsToSkip = ['v0/deployment-id', 'v0/revalidate']
