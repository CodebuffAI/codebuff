/**
 * Shared attachment metadata + display formatting.
 *
 * Kept dependency-free (no `fs`) so BOTH sides can import it: the renderer uses it
 * to render the optimistic user-message summary line, and the orchestrator (engine)
 * uses the same formatter when it persists the turn — so a reloaded transcript shows
 * exactly what streamed live. The server-side reader that actually slurps file
 * content lives in app/attachments.ts.
 */

export type AttachmentKind = 'image' | 'file' | 'directory'

export interface AttachmentMeta {
  name: string
  kind: AttachmentKind
}

/** Max files staged per message — enforced in the composer (UX) and the server
 *  reader (defensive), so a runaway client can't make us read 1000 files. */
export const MAX_ATTACHMENTS = 12

/**
 * An image's bytes ready to hand to a multimodal model as message content (base64 +
 * MIME). Vision-capable harnesses (the Codebuff agent on MiniMax M3) send these so
 * the model can actually see the picture; the path is still referenced in the prompt
 * text so the agent also knows where it lives on disk.
 */
export interface AttachmentImage {
  image: string // base64
  mediaType: string
}

/**
 * A compact one-line summary of attached items, e.g. `📎 photo.png · src · notes/`.
 * Directories get a trailing slash so they read as folders. Empty when nothing was
 * attached.
 */
export function attachmentSummary(items: readonly AttachmentMeta[]): string {
  if (!items.length) return ''
  const label = items.map((a) => (a.kind === 'directory' ? `${a.name}/` : a.name)).join(' · ')
  return `📎 ${label}`
}

/**
 * Append an attachment block (the `📎 …` summary for display, or the inlined prompt
 * block for the agent) to the user's typed text, with a blank line between. The
 * single source of truth for this join, so the renderer's optimistic message and the
 * server's persisted message can't drift. Either side may be empty.
 */
export function appendBlock(text: string, block: string): string {
  const trimmed = text.trim()
  if (!block) return trimmed
  return trimmed ? `${trimmed}\n\n${block}` : block
}
