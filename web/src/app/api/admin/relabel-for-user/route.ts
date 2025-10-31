import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { env } from '@codebuff/internal/env'
import { and, eq, gt, desc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import { checkAdminAuth } from '@/lib/admin-auth'
import { logger } from '@/util/logger'

// Helper to construct backend URL
function getBackendUrl() {
  const backendUrl = env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL || 'localhost:4242'
  const protocol = backendUrl.startsWith('localhost') ? 'http://' : 'https://'
  return `${protocol}${backendUrl}`
}

// Helper to forward request to backend
async function forwardToBackend(
  userId: string,
  method: string,
  token: string,
  body?: any,
): Promise<Response> {
  const backendUrl = getBackendUrl()
  const url = `${backendUrl}/api/admin/relabel-for-user?userId=${userId}`

  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
  }

  if (body) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  return response
}

// Helper to get active session token for user
async function getActiveSessionToken(userId: string): Promise<string | null> {
  const result = await db
    .select({ sessionToken: schema.session.sessionToken })
    .from(schema.session)
    .where(
      and(
        eq(schema.session.userId, userId),
        gt(schema.session.expires, new Date()),
      ),
    )
    .orderBy(desc(schema.session.expires))
    .limit(1)

  return result[0]?.sessionToken ?? null
}

// Helper to handle backend response
async function handleBackendResponse(response: Response) {
  if (!response.ok) {
    try {
      // Try to parse error response as JSON
      const errorData = await response.json()
      return NextResponse.json(errorData, { status: response.status })
    } catch {
      // If JSON parsing fails, return status text
      return NextResponse.json(
        { error: response.statusText || 'Request failed' },
        { status: response.status },
      )
    }
  }

  const data = await response.json()
  return NextResponse.json(data)
}

// GET handler for fetching traces
export async function GET(req: NextRequest) {
  // Check admin authentication
  const authResult = await checkAdminAuth()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) {
    return NextResponse.json(
      { error: 'Missing required parameter: userId' },
      { status: 400 },
    )
  }

  try {
    const sessionToken = await getActiveSessionToken(authResult.id)
    if (!sessionToken) {
      logger.error(
        { userId: authResult.id },
        'No active session token found for admin user',
      )
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const response = await forwardToBackend(userId, 'GET', sessionToken)
    return handleBackendResponse(response)
  } catch (error) {
    // Only use this for network/fetch errors, not backend errors
    logger.error({ error }, 'Error proxying request to backend')
    return NextResponse.json(
      { error: 'Failed to connect to backend service' },
      { status: 502 },
    )
  }
}

// POST handler for running relabelling
export async function POST(req: NextRequest) {
  // Check admin authentication
  const authResult = await checkAdminAuth()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) {
    return NextResponse.json(
      { error: 'Missing required parameter: userId' },
      { status: 400 },
    )
  }

  try {
    const sessionToken = await getActiveSessionToken(authResult.id)
    if (!sessionToken) {
      logger.error(
        { userId: authResult.id },
        'No active session token found for admin user',
      )
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const response = await forwardToBackend(userId, 'POST', sessionToken, body)
    return handleBackendResponse(response)
  } catch (error) {
    // Only use this for network/fetch errors, not backend errors
    logger.error({ error }, 'Error proxying request to backend')
    return NextResponse.json(
      { error: 'Failed to connect to backend service' },
      { status: 502 },
    )
  }
}
