import Anthropic from '@anthropic-ai/sdk'
import { TextBlockParam, Tool } from '@anthropic-ai/sdk/resources'
import { removeUndefinedProps } from 'common/util/object'
import { Message, ToolCall } from 'common/actions'
import { STOP_MARKER } from 'common/constants'
import { debugLog } from './util/debug'
import { RATE_LIMIT_POLICY } from './constants'
import { env } from './env.mjs'
import { usageTracker } from './billing/usage-tracker'

export const models = {
  sonnet: 'claude-3-5-sonnet-20240620' as const,
  haiku: 'claude-3-haiku-20240307' as const,
}

export type model_types = (typeof models)[keyof typeof models]

export type System = string | Array<TextBlockParam>

export const promptClaudeStream = async function* (
  messages: Message[],
  options: {
    system?: System
    tools?: Tool[]
    model?: model_types
    maxTokens?: number
    userId: string
    ignoreHelicone?: boolean
  }
): AsyncGenerator<string, void, unknown> {
  const {
    model = models.sonnet,
    system,
    tools,
    userId,
    maxTokens,
    ignoreHelicone = false,
  } = options

  const apiKey = env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY')
  }

  const anthropic = new Anthropic({
    apiKey,
    ...(ignoreHelicone
      ? {}
      : {
          baseURL: 'https://anthropic.helicone.ai/',
        }),
    defaultHeaders: {
      'anthropic-beta': 'prompt-caching-2024-07-31',
      ...(ignoreHelicone
        ? {}
        : {
            'Helicone-Auth': `Bearer ${env.HELICONE_API_KEY}`,
            'Helicone-User-Id': userId,
            'Helicone-RateLimit-Policy': RATE_LIMIT_POLICY,
            'Helicone-LLM-Security-Enabled': 'true',
          }),
    },
  })

  const stream = anthropic.messages.stream(
    removeUndefinedProps({
      model,
      max_tokens: maxTokens ?? 4096,
      temperature: 0,
      messages,
      system,
      tools,
      stop_sequences: [],
    })
  )

  let toolInfo = {
    name: '',
    id: '',
    json: '',
  }
  for await (const chunk of stream) {
    const { type } = chunk

    if (type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      yield chunk.delta.text
    }

    // For Tool use!
    if (
      type === 'content_block_start' &&
      chunk.content_block.type === 'tool_use'
    ) {
      const { name, id } = chunk.content_block
      toolInfo = {
        name,
        id,
        json: '',
      }
    }
    if (
      type === 'content_block_delta' &&
      chunk.delta.type === 'input_json_delta'
    ) {
      toolInfo.json += chunk.delta.partial_json
    }
    if (type === 'message_delta' && chunk.delta.stop_reason === 'tool_use') {
      const { name, id, json } = toolInfo
      const input = JSON.parse(json)
      console.error('tried to yield tool call', name, id, input)
      // yield { name, id, input }
    }
    if (type === 'message_delta' && chunk.delta.stop_reason === 'end_turn') {
      const totalTokens = chunk.usage.output_tokens
      usageTracker.addTokens(options.userId, totalTokens)
    }
    if (type === 'message_start') {
      const inputTokens = chunk.message.usage.input_tokens
      usageTracker.addTokens(options.userId, inputTokens)
    }
  }
}

export const promptClaude = async (
  messages: Message[],
  options: {
    userId: string
    system?: string | Array<TextBlockParam>
    tools?: Tool[]
    model?: model_types
    maxTokens?: number
    ignoreHelicone?: boolean
  }
) => {
  let fullResponse = ''
  for await (const chunk of promptClaudeStream(messages, options)) {
    fullResponse += chunk
  }
  return fullResponse
}

export async function promptClaudeWithContinuation(
  messages: Message[],
  options: {
    userId: string
    system?: string
    model?: model_types
    ignoreHelicone?: boolean
  }
) {
  let fullResponse = ''
  let continuedMessage: Message | null = null
  let isComplete = false

  // Add the instruction to end with the stop market to the system prompt
  if (options.system) {
    options.system += `\n\nAlways end your response with "${STOP_MARKER}".`
  } else {
    options.system = `Always end your response with "${STOP_MARKER}".`
  }

  while (!isComplete) {
    const messagesWithContinuedMessage = continuedMessage
      ? [...messages, continuedMessage]
      : messages
    debugLog(
      'prompt claude with continuation',
      messagesWithContinuedMessage.length
    )
    const stream = promptClaudeStream(messagesWithContinuedMessage, options)

    for await (const chunk of stream) {
      fullResponse += chunk
    }

    if (continuedMessage) {
      debugLog('Continuation response:', fullResponse)
      console.log('got continuation response')
    }

    if (fullResponse.includes(STOP_MARKER)) {
      isComplete = true
      fullResponse = fullResponse.replace(STOP_MARKER, '')
    } else {
      continuedMessage = {
        role: 'assistant',
        content: fullResponse,
      }
    }
  }

  return { response: fullResponse }
}
