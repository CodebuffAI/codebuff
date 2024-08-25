import Anthropic from '@anthropic-ai/sdk'
import { TextBlockParam, Tool } from '@anthropic-ai/sdk/resources'
import { removeUndefinedProps } from 'common/util/object'
import { Message, ToolCall } from 'common/actions'
import { STOP_MARKER } from 'common/constants'
import { debugLog } from './util/debug'
import { RATE_LIMIT_POLICY } from './constants'

export const models = {
  sonnet: 'claude-3-5-sonnet-20240620' as const,
  haiku: 'claude-3-haiku-20240307' as const,
}

export type model_types = (typeof models)[keyof typeof models]

export const promptClaudeStream = async function* (
  messages: Message[],
  options: {
    system?: string | Array<TextBlockParam>
    tools?: Tool[]
    model?: model_types
    userId: string
  }
): AsyncGenerator<string | ToolCall, void, unknown> {
  const { model = models.sonnet, system, tools, userId } = options

  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY')
  }

  const anthropic = new Anthropic({
    apiKey,
    baseURL: 'https://anthropic.helicone.ai/',
    defaultHeaders: {
      'anthropic-beta': 'prompt-caching-2024-07-31',
      'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
      'Helicone-User-Id': userId,
      'Helicone-RateLimit-Policy': RATE_LIMIT_POLICY,
      'Helicone-LLM-Security-Enabled': 'true',
    },
  })

  const stream = anthropic.messages.stream(
    removeUndefinedProps({
      model,
      max_tokens: 4096,
      temperature: 0,
      messages,
      system,
      tools,
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
      yield { name, id, input }
    }
  }
}

export const promptClaude = async (
  prompt: string,
  options: {
    system?: string
    tools?: Tool[]
    model?: model_types
    userId: string
  }
) => {
  let fullResponse = ''
  for await (const chunk of promptClaudeStream(
    [{ role: 'user', content: prompt }],
    options
  )) {
    fullResponse += chunk
  }
  return fullResponse
}

export async function promptClaudeWithContinuation(
  messages: Message[],
  options: {
    system?: string | Array<TextBlockParam>
    tools?: Tool[]
    model?: model_types
    userId: string
    checkComplete?: (response: string) => boolean
  }
) {
  let fullResponse = ''
  let continuedMessages: Message[] = []
  let isComplete = false

  if (!options.system) {
    options.system = `Always end your response with "${STOP_MARKER}".`
  }

  while (!isComplete) {
    const messagesWithContinuedMessage = [...messages, ...continuedMessages]
    debugLog(
      'prompt claude with continuation',
      messagesWithContinuedMessage.length
    )
    const stream = promptClaudeStream(messagesWithContinuedMessage, options)

    for await (const chunk of stream) {
      fullResponse += chunk
    }

    if (continuedMessages.length > 0) {
      debugLog('Continuation response:', fullResponse)
      console.log('got continuation response')
    }

    if (options.checkComplete) {
      isComplete = options.checkComplete(fullResponse)
    }
    if (fullResponse.includes(STOP_MARKER)) {
      isComplete = true
      fullResponse = fullResponse.replace(STOP_MARKER, '')
    }
    if (!isComplete) {
      const fullResponseMinusLastLine =
        fullResponse.split('\n').slice(0, -1).join('\n') + '\n'
      continuedMessages = [
        {
          role: 'assistant',
          content: fullResponseMinusLastLine,
        },
        {
          role: 'user',
          content: `You got cut off, but please continue from the very next line of your response. Do not repeat anything you have just said. Just continue as if there were no interruption from the very last character of your last response. (Alternatively, just end your response with the following marker if you were done generating and want to allow the user to give further guidance: ${STOP_MARKER})`,
        },
      ]
    }
  }

  return { response: fullResponse }
}
