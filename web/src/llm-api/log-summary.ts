import type { ChatMessage } from './types'

/**
 * Compact, PII-safe summary of chat-completion messages, for log payloads where
 * the raw messages are intentionally omitted (they're large and carry user text
 * and base64 image bytes — see `messagesOmitted` in the completions route).
 *
 * The *shape* of the content is exactly what you need to triage a failure that
 * the bare `messageCount` can't answer: was there an image? how big? what media
 * type? A provider "failed to decode image" 400 is indistinguishable from a
 * pipeline bug until you can see "the image was 78 bytes of image/png" — i.e. a
 * malformed/degenerate image, not a transport problem.
 *
 * This returns only counts, byte sizes, and media types — never the content
 * itself — so it is safe to attach to every error log without ingesting payloads
 * or PII.
 */
export interface MessagesLogSummary {
  messageCount: number
  /** Role occurrence counts, e.g. `{ system: 1, user: 2, assistant: 1 }`. */
  roles: Record<string, number>
  /** Number of `image_url` parts across all messages. */
  imageCount: number
  /** Approx decoded byte size of each image (base64 length × ¾), in order — a
   *  78 here next to a "failed to decode" error means a bad/degenerate image. */
  imageBytes: number[]
  /** Distinct media types parsed from the image data URLs (e.g. `image/png`). */
  imageMediaTypes: string[]
  /** Count of image parts whose URL is a remote http(s) URL, not a data URL. */
  remoteImageCount: number
  /** Total characters of text content (cheap signal of prompt size). */
  textChars: number
}

// data:[<mediatype>][;base64],<payload>
const DATA_URL_RE = /^data:([^;,]*)?(?:;base64)?,(.*)$/s

/** Read an image part's URL, tolerating both the `string` and `{ url }` shapes.
 *  Loose typing on purpose: the content-part union has a catch-all member, so
 *  field access after a `type` check isn't cleanly narrowable. */
function imageUrlOf(part: { image_url?: unknown }): string | undefined {
  const u = part.image_url
  if (typeof u === 'string') return u
  if (u && typeof u === 'object') {
    const url = (u as { url?: unknown }).url
    if (typeof url === 'string') return url
  }
  return undefined
}

export function summarizeMessagesForLog(messages: unknown): MessagesLogSummary {
  const summary: MessagesLogSummary = {
    messageCount: 0,
    roles: {},
    imageCount: 0,
    imageBytes: [],
    imageMediaTypes: [],
    remoteImageCount: 0,
    textChars: 0,
  }
  if (!Array.isArray(messages)) return summary
  summary.messageCount = messages.length

  const mediaTypes = new Set<string>()
  for (const message of messages as ChatMessage[]) {
    if (!message || typeof message !== 'object') continue
    if (message.role) {
      summary.roles[message.role] = (summary.roles[message.role] ?? 0) + 1
    }
    const content = message.content
    if (typeof content === 'string') {
      summary.textChars += content.length
      continue
    }
    if (!Array.isArray(content)) continue
    for (const rawPart of content) {
      if (!rawPart || typeof rawPart !== 'object') continue
      const part = rawPart as { type?: string; text?: unknown }
      if (part.type === 'text') {
        if (typeof part.text === 'string') summary.textChars += part.text.length
      } else if (part.type === 'image_url') {
        summary.imageCount++
        const url = imageUrlOf(rawPart as { image_url?: unknown })
        if (!url) continue
        const m = DATA_URL_RE.exec(url)
        if (m) {
          if (m[1]) mediaTypes.add(m[1])
          // base64 length × ¾ ≈ decoded byte count (close enough for triage).
          summary.imageBytes.push(Math.floor((m[2]?.length ?? 0) * 0.75))
        } else {
          summary.remoteImageCount++
        }
      }
    }
  }
  summary.imageMediaTypes = [...mediaTypes]
  return summary
}
