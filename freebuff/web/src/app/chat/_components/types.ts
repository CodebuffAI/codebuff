export interface ThreadSummary {
  id: string
  title: string
  model: string
  updated_at: string
}

import type { ChatBlock } from '@/app/chat/blocks'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Block tree (text + subagent boxes); set when the turn spawned agents.
   *  When present it supersedes `content` for rendering. */
  blocks?: ChatBlock[]
  /** Set while the assistant message is still streaming in. */
  streaming?: boolean
  /** Inline error shown in place of/after content. */
  error?: string
}
