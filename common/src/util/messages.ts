import type { CodebuffMessage, Message } from '../types/message'
import type { ModelMessage } from 'ai'

interface ScreenshotRef {
  msgIdx: number
  contentIdx: number
}

/**
 * Limits the total number of screenshots across all messages to maxCount,
 * keeping only the most recent ones.
 */
export function limitScreenshots(
  messages: Message[],
  maxCount: number,
): Message[] {
  const screenshots = messages.flatMap((msg, msgIdx) =>
    Array.isArray(msg.content)
      ? msg.content
          .map((item, contentIdx) =>
            item.type === 'image' ? { msgIdx, contentIdx } : null,
          )
          .filter((ref): ref is ScreenshotRef => ref !== null)
      : [],
  )

  if (screenshots.length <= maxCount) return messages

  const keepRefs = new Set(
    screenshots
      .slice(-maxCount)
      .map((ref) => `${ref.msgIdx}-${ref.contentIdx}`),
  )

  return messages.map((msg, msgIdx) =>
    Array.isArray(msg.content)
      ? {
          ...msg,
          content: msg.content.filter(
            (item, contentIdx) =>
              item.type !== 'image' || keepRefs.has(`${msgIdx}-${contentIdx}`),
          ),
        }
      : msg,
  )
}

export function toContentString(msg: ModelMessage): string {
  const { content } = msg
  if (typeof content === 'string') return content
  return content.map((item) => (item as any)?.text ?? '').join('\n')
}

export function withCacheControl(msg: CodebuffMessage): CodebuffMessage {
  const message = { ...msg }
  if (!message.providerOptions) {
    message.providerOptions = {}
  }
  if (!message.providerOptions.anthropic) {
    message.providerOptions.anthropic = {}
  }
  message.providerOptions.anthropic.cacheControl = { type: 'ephemeral' }
  if (!message.providerOptions.openrouter) {
    message.providerOptions.openrouter = {}
  }
  message.providerOptions.openrouter.cacheControl = { type: 'ephemeral' }
  return message
}
