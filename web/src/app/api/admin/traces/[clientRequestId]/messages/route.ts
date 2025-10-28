import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import { checkAdminAuth } from '@/lib/admin-auth'
import { logger } from '@/util/logger'

interface RouteParams {
  params: {
    clientRequestId: string
  }
}

export interface TraceMessage {
  id: string
  client_request_id: string | null
  user_id: string | null
  model: string
  request: any
  response: any
  finished_at: Date
  latency_ms: number | null
  credits: number
  input_tokens: number
  output_tokens: number
  org_id: string | null
  repo_url: string | null
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  // Check admin authentication
  const authResult = await checkAdminAuth()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { clientRequestId } = params

  if (!clientRequestId) {
    return NextResponse.json(
      { error: 'Missing required parameter: clientRequestId' },
      { status: 400 }
    )
  }

  try {
    // Query messages by client_request_id
    const messages = await db
      .select({
        id: schema.message.id,
        client_request_id: schema.message.client_request_id,

        user_id: schema.message.user_id,
        model: schema.message.model,
        request: schema.message.request,
        response: schema.message.response,
        finished_at: schema.message.finished_at,
        latency_ms: schema.message.latency_ms,
        credits: schema.message.credits,
        input_tokens: schema.message.input_tokens,
        output_tokens: schema.message.output_tokens,
        org_id: schema.message.org_id,
        repo_url: schema.message.repo_url,
      })
      .from(schema.message)
      .where(eq(schema.message.client_request_id, clientRequestId))
      .orderBy(schema.message.finished_at)

    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'No messages found for this client request ID' },
        { status: 404 }
      )
    }

    logger.info(
      {
        adminId: authResult.id,
        clientRequestId,
        messageCount: messages.length,
      },
      'Admin fetched trace messages'
    )

    return NextResponse.json({ messages })
  } catch (error) {
    logger.error({ error, clientRequestId }, 'Error fetching trace messages')
    return NextResponse.json(
      { error: 'Failed to fetch trace messages' },
      { status: 500 }
    )
  }
}
