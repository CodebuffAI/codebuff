// import { getSecrets } from 'common/secrets'
import Anthropic from '@anthropic-ai/sdk'
import { removeUndefinedProps } from 'common/util/object'

export const models = {
  sonnet: 'claude-3-5-sonnet-20240620' as const,
  haiku: 'claude-3-haiku-20240307' as const,
}

export type model_types = (typeof models)[keyof typeof models]

export const promptClaudeStream = async function* (
  prompt: string,
  options: { system?: string; model?: model_types } = {}
): AsyncGenerator<string, void, unknown> {
  const { model = models.sonnet, system } = options

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
      system,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })
  )

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      yield chunk.delta.text
    }
  }
}

export const promptClaude = async (
  prompt: string,
  options: { system?: string; model?: model_types } = {}
) => {
  let fullResponse = ''
  for await (const chunk of promptClaudeStream(prompt, options)) {
    fullResponse += chunk
  }
  return fullResponse
}
