import { Message } from '../types/message'

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
  maxCount: number
): Message[] {
  const screenshots = messages.flatMap((msg, msgIdx) =>
    Array.isArray(msg.content)
      ? msg.content
          .map((item, contentIdx) =>
            item.type === 'image' ? { msgIdx, contentIdx } : null
          )
          .filter((ref): ref is ScreenshotRef => ref !== null)
      : []
  )

  if (screenshots.length <= maxCount) return messages

  const keepRefs = new Set(
    screenshots.slice(-maxCount).map((ref) => `${ref.msgIdx}-${ref.contentIdx}`)
  )

  return messages.map((msg, msgIdx) =>
    Array.isArray(msg.content)
      ? {
          ...msg,
          content: msg.content.filter(
            (item, contentIdx) =>
              item.type !== 'image' || keepRefs.has(`${msgIdx}-${contentIdx}`)
          ),
        }
      : msg
  )
}

export function toContentString(msg: Message): string {
  const { content } = msg
  if (typeof content === 'string') return content
  return content.map((item) => (item as any)?.text ?? '').join('\n')
}
