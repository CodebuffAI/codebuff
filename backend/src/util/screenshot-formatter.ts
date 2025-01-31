import { Message, MessageContentObject } from 'common/actions'
import { TOOL_RESULT_MARKER } from 'common/constants'

export type AIProvider = 'anthropic' | 'openai' | 'deepseek'

/**
 * Parse JSON content from a string, removing TOOL_RESULT_MARKER if present
 */
function parseToolResultJson(content: string): Record<string, any> | null {
  try {
    const jsonContent = content.replace(TOOL_RESULT_MARKER, '').trim()
    return JSON.parse(jsonContent)
  } catch (e) {
    return null
  }
}

/**
 * Apply provider-specific formatting to image blocks
 */
function applyProviderFormatting(
  imageBlock: MessageContentObject & { type: 'image' },
  provider: AIProvider
) {
  if (provider === 'anthropic') {
    // Always use ephemeral caching for Anthropic to avoid token overhead
    imageBlock.cache_control = { type: 'ephemeral' }
  } else if (provider === 'openai' || provider === 'deepseek') {
    // Use ephemeral for large images with OpenAI/Deepseek
    const base64Length = imageBlock.source.data.length
    if (base64Length > 200000) {
      imageBlock.cache_control = { type: 'ephemeral' }
    }
  }
}

/**
 * Transform a single message content object to handle screenshots
 */
function transformMessageContent(
  contentObj: MessageContentObject,
  provider: AIProvider
): MessageContentObject[] {
  if (contentObj.type !== 'tool_result') {
    return [contentObj]
  }

  const parsed = parseToolResultJson(contentObj.content)
  if (!parsed?.screenshot) {
    return [contentObj]
  }

  const imageBlock: MessageContentObject = {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/jpeg',
      data: parsed.screenshot,
    },
  }

  applyProviderFormatting(imageBlock, provider)

  delete parsed.screenshot
  const updatedToolResult = {
    ...contentObj,
    content: JSON.stringify(parsed),
  }

  return [updatedToolResult, imageBlock]
}

/**
 * Transform a single message to handle screenshots
 */
export function transformMessage(
  message: Message,
  provider: AIProvider
): Message {
  if (typeof message.content === 'string') {
    const parsed = parseToolResultJson(message.content)
    if (!parsed?.screenshot) {
      return message
    }

    const imageBlock: MessageContentObject = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: parsed.screenshot,
      },
    }

    applyProviderFormatting(imageBlock, provider)

    delete parsed.screenshot
    return {
      ...message,
      content: [
        {
          type: 'text',
          text: JSON.stringify(parsed),
        },
        imageBlock,
      ],
    }
  }

  return {
    ...message,
    content: message.content.flatMap(obj => transformMessageContent(obj, provider)),
  }
}
