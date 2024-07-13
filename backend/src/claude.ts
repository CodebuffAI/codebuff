import Anthropic from '@anthropic-ai/sdk'
import { Tool } from '@anthropic-ai/sdk/resources'
import { removeUndefinedProps } from '@manicode/common'
import { Message } from 'common/src/actions'

export const models = {
  sonnet: 'claude-3-5-sonnet-20240620' as const,
  haiku: 'claude-3-haiku-20240307' as const,
}

export type model_types = (typeof models)[keyof typeof models]

export const promptClaudeStream = async function* (
  messages: Message[],
  options: { system?: string; tools?: Tool[]; model?: model_types } = {}
): AsyncGenerator<string, void, unknown> {
  const { model = models.sonnet, system, tools } = options

  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY')
  }

  const anthropic = new Anthropic({ apiKey })

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
    input: {},
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
      const { name, id, input } = chunk.content_block
      toolInfo = {
        name,
        id,
        input: input as {},
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
      const { name, id, input, json } = toolInfo
      // yield { name, id, input, json }
    }
  }
}

export const promptClaude = async (
  prompt: string,
  options: { system?: string; tools?: Tool[]; model?: model_types } = {}
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
