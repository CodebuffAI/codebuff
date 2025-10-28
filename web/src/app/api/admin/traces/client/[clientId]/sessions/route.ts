import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import {
  extractUserPromptFromRequest,
  extractAssistantResponseFromResponse,
} from '@/app/admin/traces/utils/trace-processing'
import { checkAdminAuth } from '@/lib/admin-auth'
import { logger } from '@/util/logger'

interface RouteParams {
  params: {
    clientId: string
  }
}

export interface ClientMessage {
  id: string
  client_request_id: string
  timestamp: Date
  user_prompt?: string
  assistant_response: string
  model: string
  credits_used: number
}

export interface ClientSession {
  client_id: string
  messages: ClientMessage[]
  total_credits: number
  date_range: {
    start: Date
    end: Date
  }
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  // Check admin authentication
  const authResult = await checkAdminAuth()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { clientId } = params

  if (!clientId) {
    return NextResponse.json(
      { error: 'Missing required parameter: clientId' },
      { status: 400 }
    )
  }

  try {
    // Query all messages for this client_id
    const messages = await db
      .select({
        id: schema.message.id,
        client_request_id: schema.message.client_request_id,
        finished_at: schema.message.finished_at,
        model: schema.message.model,
        request: schema.message.request,
        response: schema.message.response,
        credits: schema.message.credits,
      })
      .from(schema.message)
      .where(eq(schema.message.client_id, clientId))
      .orderBy(schema.message.finished_at)

    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'No messages found for this client ID' },
        { status: 404 }
      )
    }

    // Transform messages into client messages
    const clientMessages: ClientMessage[] = messages.map((msg) => ({
      id: msg.id,
      client_request_id: msg.client_request_id ?? 'NULL',
      timestamp: msg.finished_at,
      user_prompt: extractUserPromptFromRequest(msg.request),
      assistant_response: extractAssistantResponseFromResponse(msg.response),
      model: msg.model,
      credits_used: msg.credits,
    }))

    // Calculate total credits
    const totalCredits = messages.reduce((sum, msg) => sum + msg.credits, 0)

    // Get date range
    const dateRange = {
      start: messages[0].finished_at,
      end: messages[messages.length - 1].finished_at,
    }

    const session: ClientSession = {
      client_id: clientId,
      messages: clientMessages,
      total_credits: totalCredits,
      date_range: dateRange,
    }

    logger.info(
      {
        adminId: authResult.id,
        clientId,
        messageCount: messages.length,
        totalCredits,
      },
      'Admin fetched client session'
    )

    return NextResponse.json(session)
  } catch (error) {
    logger.error({ error, clientId }, 'Error fetching client session')
    return NextResponse.json(
      { error: 'Failed to fetch client session' },
      { status: 500 }
    )
  }
}
