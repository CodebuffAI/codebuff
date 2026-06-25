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

/** An uploaded document (code/text/CSV/…, later PDF/DOCX) attached to a user
 *  message. The blob holds the extracted text; the UI only renders a labeled
 *  chip, so no serving URL is needed. */
export interface ChatDocument {
  storageId: string
  mediaType: string
  name: string
  chars: number
  truncated: boolean
}

/** A composer attachment (image or document), tracked while it uploads. */
export interface PendingAttachment {
  /** Local id (not the storage id) so list updates are stable. */
  id: string
  kind: 'image' | 'document'
  name: string
  mediaType: string
  status: 'uploading' | 'done' | 'error'
  /** Set once the upload succeeds. */
  storageId?: string
  /** Images only: object URL for instant local preview, and the resolved
   *  serving URL once uploaded. */
  previewUrl?: string
  url?: string
  /** Documents only: extracted-text size metadata, set once uploaded. */
  chars?: number
  truncated?: boolean
  error?: string
}

/** A message the user submitted while a run was in flight, buffered on the
 *  client and auto-sent once the active run finishes. */
export interface QueuedMessage {
  content: string
  images: ChatImage[]
  documents: ChatDocument[]
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
  /** Document attachments on user turns. */
  documents?: ChatDocument[]
  /** Set while the assistant message is still streaming in. */
  streaming?: boolean
  /** Inline error shown in place of/after content. */
  error?: string
}
