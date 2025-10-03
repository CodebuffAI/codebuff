import { getUserUsageData } from '@codebuff/billing/usage-service'
import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey } from '@/db/user'
import { handleOpenRouterStream } from '@/llm-api/openrouter'
import { extractApiKeyFromHeader } from '@/util/auth'
import { errorToObject } from '@/util/error'
import { logger } from '@/util/logger'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log('asdf', {
      req: { headers: Object.fromEntries(req.headers), body },
    })

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

    if (body.stream) {
      try {
        const stream = await handleOpenRouterStream({
          body,
          userId,
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
        logger.error(
          errorToObject(error),
          'Error setting up OpenRouter stream:'
        )
        return NextResponse.json(
          { error: 'Failed to initialize stream' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(
      { message: 'Not implemented. Use stream=true.' },
      { status: 500 }
    )
  } catch (error) {
    logger.error(
      errorToObject(error),
      'Error processing chat completions request:'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
