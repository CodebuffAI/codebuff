export interface ThreadSummary {
  id: string
  title: string
  model: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Set while the assistant message is still streaming in. */
  streaming?: boolean
  /** Inline error shown in place of/after content. */
  error?: string
}
