import { getUserUsageData } from '@codebuff/billing/usage-service'
import { getErrorObject } from '@codebuff/common/util/error'
import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import { getAgentRunFromId } from '@/db/agent-run'
import { getUserInfoFromApiKey } from '@/db/user'
import { handleOpenRouterStream } from '@/llm-api/openrouter'
import { extractApiKeyFromHeader } from '@/util/auth'
import { logger } from '@/util/logger'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const apiKey = extractApiKeyFromHeader(req)

    if (!apiKey) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const userInfo = await getUserInfoFromApiKey({ apiKey, fields: ['id'] })
    if (!userInfo) {
      return NextResponse.json(
        { message: 'Invalid Codebuff API key' },
        { status: 401 }
      )
    }

    const userId = userInfo.id
    const {
      balance: { totalRemaining },
      nextQuotaReset,
    } = await getUserUsageData(userId)
    if (totalRemaining <= 0) {
      return NextResponse.json(
        {
          message: `Insufficient credits. Please add credits at ${process.env.NEXT_PUBLIC_APP_URL}/usage or wait for your next cycle to begin (${nextQuotaReset}).`,
        },
        { status: 402 }
      )
    }

    if (!body.stream) {
      return NextResponse.json(
        { message: 'Not implemented. Use stream=true.' },
        { status: 500 }
      )
    }

    const runIdFromBody: string | undefined =
      body.codebuff_metadata?.agent_run_id
    if (!runIdFromBody || typeof runIdFromBody !== 'string') {
      return NextResponse.json(
        { message: 'No agentRunId found in request body' },
        { status: 400 }
      )
    }

    const agentRun = await getAgentRunFromId({
      agentRunId: runIdFromBody,
      userId,
      fields: ['agent_id', 'status'],
    })
    if (!agentRun) {
      return NextResponse.json(
        { message: `agentRunId Not Found: ${runIdFromBody}` },
        { status: 400 }
      )
    }

    const { agent_id: agentId, status: agentRunStatus } = agentRun

    if (agentRunStatus !== 'running') {
      return NextResponse.json(
        { message: `agentRunId Not Running: ${runIdFromBody}` },
        { status: 400 }
      )
    }

    try {
      const stream = await handleOpenRouterStream({
        body,
        userId,
        agentId,
      })

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch (error) {
      logger.error(getErrorObject(error), 'Error setting up OpenRouter stream:')
      return NextResponse.json(
        { error: 'Failed to initialize stream' },
        { status: 500 }
      )
    }
  } catch (error) {
    logger.error(
      getErrorObject(error),
      'Error processing chat completions request:'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
