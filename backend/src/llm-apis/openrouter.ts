import { models } from '@codebuff/common/old-constants'
import { isExplicitlyDefinedModel } from '@codebuff/common/util/model-utils'
import { env } from '@codebuff/internal/env'
import { createOpenRouter } from '@codebuff/internal/openrouter-ai-sdk'
import { cloneDeep } from 'lodash'
import z from 'zod/v4'

import type { Model } from '@codebuff/common/old-constants'
import type { Request, Response } from 'express'

// Provider routing documentation: https://openrouter.ai/docs/features/provider-routing
const providerOrder = {
  [models.openrouter_claude_sonnet_4]: [
    'Google',
    'Anthropic',
    'Amazon Bedrock',
  ],
  [models.openrouter_claude_sonnet_4_5]: [
    'Google',
    'Anthropic',
    'Amazon Bedrock',
  ],
  [models.openrouter_claude_opus_4]: ['Google', 'Anthropic'],
} as const

export function openRouterLanguageModel(model: Model) {
  const extraBody: Record<string, any> = {
    transforms: ['middle-out'],
  }

  // Set allow_fallbacks based on whether model is explicitly defined
  const isExplicitlyDefined = isExplicitlyDefinedModel(model)

  extraBody.provider = {
    order: providerOrder[model as keyof typeof providerOrder],
    allow_fallbacks: !isExplicitlyDefined,
  }

  return createOpenRouter({
    apiKey: env.OPEN_ROUTER_API_KEY,
    headers: {
      'HTTP-Referer': 'https://codebuff.com',
      'X-Title': 'Codebuff',
    },
    extraBody,
  }).languageModel(model, {
    usage: { include: true },
    logprobs: true,
  })
}

const openrouterUsageSchema = z
  .object({
    prompt_tokens: z.number(),
    prompt_tokens_details: z
      .object({
        cached_tokens: z.number(),
      })
      .nullish(),
    completion_tokens: z.number(),
    completion_tokens_details: z
      .object({
        reasoning_tokens: z.number(),
      })
      .nullish(),
    total_tokens: z.number(),
    cost: z.number().optional(),
    cost_details: z
      .object({
        upstream_inference_cost: z.number().nullish(),
      })
      .nullish(),
  })
  .nullish()

export async function handleOpenrouterStream({
  req,
  res,
  userId,
}: {
  req: Request
  res: Response
  userId: string
}) {
  res.writeHead(200, {
    // Mandatory SSE headers
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    // (optional) allow local browser demos
    'Access-Control-Allow-Origin': '*',
  })

  res.write(`: connected ${new Date().toISOString()}\n`)
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat ${new Date().toISOString()}\n\n`)
  }, 30000)
  res.on('close', () => {
    clearInterval(heartbeat)
  })

  const body = cloneDeep(req.body)
  if (body.usage === undefined) {
    body.usage = {}
  }
  body.usage.include = true
  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPEN_ROUTER_API_KEY}`,
        'HTTP-Referer': 'https://codebuff.com',
        'X-Title': 'Codebuff',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  const reader = response.body?.getReader()
  if (!reader) {
    res.status(500).json({ message: 'Failed to get response reader' })
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      console.log('asdf', {
        done,
        value: decoder.decode(value, { stream: true }),
      })
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      let lineEnd = buffer.indexOf('\n')
      while (lineEnd !== -1) {
        const line = buffer.slice(0, lineEnd + 1)
        buffer = buffer.slice(lineEnd + 1)
        // if (line.startsWith('data: ')) {
        //   const data = line.trim().slice('data: '.length)
        //   await processData(data, userId)
        // }
        res.write(line)
        lineEnd = buffer.indexOf('\n')
      }
    }
  } finally {
    reader.cancel()
  }
  res.end()
}

/*

async function processData(data: string, userId: string) {
  if (data === '[DONE]') {
    return
  }

  let obj
  try {
    obj = JSON.parse(data)
  } catch (error) {
    trackEvent(
      AnalyticsEvent.OPENROUTER_MALFORMED_JSON_RESPONSE_CHUNK,
      userId,
      {
        data,
      },
    )
    return
  }

  if (typeof obj !== 'object') {
    return
  }
  if (typeof obj.usage !== 'object') {
    return
  }
  const parseResult = openrouterUsageSchema.safeParse(obj.usage)
  if (!parseResult.success) {
    trackEvent(
      AnalyticsEvent.OPENROUTER_MALFORMED_JSON_RESPONSE_CHUNK,
      userId,
      {
        message: `Usage does not match schema:\n${parseResult.error.message}`,
        data,
      },
    )
    return
  }

  const directCost = parseResult?.data?.cost ?? 0
  const upstreamCost = parseResult?.data?.cost_details?.upstream_inference_cost

  saveMessage({
    messageId: obj.id,
    userId,
    clientSessionId: generateCompactId('direct-'),
    fingerprintId: generateCompactId('direct-'),
    userInputId: generateCompactId('direct-'),
    model,
    request,
  request: Message[]
  response: string
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  finishedAt: Date
  latencyMs: number
  usesUserApiKey?: boolean
  chargeUser?: boolean
  costOverrideDollars?: number
  agentId?: string
  })
}

*/
