export interface ThreadSummary {
  id: string
  title: string
  model: string
  updated_at: string
}

import type { ChatBlock } from '@/app/chat/blocks'

/** An uploaded image attached to a user message, as rendered in the
 *  transcript. `url` points at Convex file storage. */
export interface ChatImage {
  storageId: string
  url: string
  mediaType: string
  name?: string
}

/** A composer attachment, tracked while it uploads to Convex. */
export interface PendingImage {
  /** Local id (not the storage id) so list updates are stable. */
  id: string
  name: string
  mediaType: string
  /** Object URL for instant local preview while/after uploading. */
  previewUrl: string
  status: 'uploading' | 'done' | 'error'
  /** Set once the upload succeeds. */
  storageId?: string
  url?: string
  error?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Block tree (text + subagent boxes); set when the turn spawned agents.
   *  When present it supersedes `content` for rendering. */
  blocks?: ChatBlock[]
  /** Image attachments on user turns. */
  images?: ChatImage[]
  /** Set while the assistant message is still streaming in. */
  streaming?: boolean
  /** Inline error shown in place of/after content. */
  error?: string
}
