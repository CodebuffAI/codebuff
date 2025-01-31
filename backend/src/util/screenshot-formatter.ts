import { Message, MessageContentObject } from 'common/actions'
import { TOOL_RESULT_MARKER } from 'common/constants'

export type AIProvider = 'anthropic' | 'openai' | 'deepseek'

function parseJson(content: string): Record<string, any> | null {
  try {
    return JSON.parse(content.replace(TOOL_RESULT_MARKER, '').trim())
  } catch {
    return null
  }
}

function createImageBlock(
  base64Data: string,
  provider: AIProvider
): MessageContentObject {
  const imageBlock = {
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/jpeg' as const,
      data: base64Data,
    },
  }

  // // Always use ephemeral for Anthropic, or for large images with other providers
  // if (provider === 'anthropic' || base64Data.length > 200000) {
  //   return { ...imageBlock, cache_control: { type: 'ephemeral' as const } }
  // }

  return imageBlock
}

export function transformMessage(
  message: Message,
  provider: AIProvider
): Message {
  // Handle string content
  if (typeof message.content === 'string') {
    const parsed = parseJson(message.content)
    if (!parsed?.screenshot) return message

    return {
      ...message,
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ...parsed, screenshot: undefined }),
        },
        createImageBlock(parsed.screenshot, provider),
      ],
    }
  }

  // Handle array content
  return {
    ...message,
    content: message.content.flatMap((obj) => {
      if (obj.type !== 'tool_result') return [obj]

      const parsed = parseJson(obj.content)
      if (!parsed?.screenshot) return [obj]

      return [
        {
          ...obj,
          content: JSON.stringify({ ...parsed, screenshot: undefined }),
        },
        createImageBlock(parsed.screenshot, provider),
      ]
    }),
  }
}
