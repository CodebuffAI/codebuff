import { DATA_URL_RE, imageUrlOf } from './log-summary'

import type { ChatMessage } from './types'

/**
 * Providers hard-fail the whole request when a degenerate image part reaches
 * them — e.g. MiMo 400s with "Param Incorrect" on a `data:image/png;base64,`
 * URL whose payload is zero bytes (seen from failed screenshot/upload capture
 * upstream). This strips those parts before any provider sees them, replacing
 * each with a short text notice so the model knows an attachment was lost and
 * an image-only message never ends up with empty content.
 *
 * Pure by design (no logger dependency): callers log the returned `dropped`
 * metadata alongside their request context so the producing surface can be
 * traced and fixed.
 */

export interface DroppedImagePart {
  /** Index of the containing message in the request's `messages` array. */
  messageIndex: number
  role: string | undefined
  /** Media type parsed from the data URL, e.g. `image/png`. */
  mediaType: string | undefined
  /** `empty-url`: missing/blank URL; `empty-data`: data URL with no payload. */
  reason: 'empty-url' | 'empty-data'
}

const OMITTED_IMAGE_NOTICE =
  '[An attached image was omitted because it contained no data.]'

/** Why an image part is degenerate, or undefined if it's sendable. */
function emptyImageReason(part: {
  image_url?: unknown
}): Pick<DroppedImagePart, 'reason' | 'mediaType'> | undefined {
  const url = imageUrlOf(part)
  if (!url) return { reason: 'empty-url', mediaType: undefined }
  const m = DATA_URL_RE.exec(url)
  if (m && (m[2]?.length ?? 0) === 0) {
    return { reason: 'empty-data', mediaType: m[1] || undefined }
  }
  return undefined
}

export function dropEmptyImageParts(messages: ChatMessage[]): {
  messages: ChatMessage[]
  dropped: DroppedImagePart[]
} {
  if (!Array.isArray(messages)) return { messages, dropped: [] }

  const dropped: DroppedImagePart[] = []
  const sanitized = messages.map((message, messageIndex) => {
    const content = message?.content
    if (!Array.isArray(content)) return message

    let droppedInMessage = 0
    const parts = content.map((part) => {
      if (!part || part.type !== 'image_url') return part
      const empty = emptyImageReason(part as { image_url?: unknown })
      if (!empty) return part
      droppedInMessage++
      dropped.push({ messageIndex, role: message.role, ...empty })
      return { type: 'text' as const, text: OMITTED_IMAGE_NOTICE }
    })

    return droppedInMessage > 0 ? { ...message, content: parts } : message
  })

  return dropped.length > 0
    ? { messages: sanitized, dropped }
    : { messages, dropped }
}
