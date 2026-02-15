import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import type { FeedbackCategory } from '@codebuff/common/constants/feedback'

import type { ChatMessage } from '../types/chat'
import type { ChatTheme } from '../types/theme-system'
import type { MarkdownPalette } from '../utils/markdown-renderer'

/**
 * Context values that are updated by the Chat component and consumed by
 * message rendering components (MessageWithAgents, AgentMessage, etc).
 */
export interface MessageBlockContext {
  /** Active chat theme (colors, etc). */
  theme: ChatTheme | null
  /** Palette for markdown rendering. Null until Chat component initializes it. */
  markdownPalette: MarkdownPalette | null
  /** Message tree mapping parent message ID -> child agent messages. */
  messageTree: Map<string, ChatMessage[]> | null
  /** Whether the main agent is currently waiting for a response. */
  isWaitingForResponse: boolean
  /** Timer start time for the main agent stream, used for UI timers. */
  timerStartTime: number | null
  /** Available width for rendering message content. */
  availableWidth: number
}

/**
 * Stable callback functions for message block interactions.
 * These are set by the Chat component and consumed by message blocks.
 */
export interface MessageBlockCallbacks {
  onToggleCollapsed: (id: string) => void
  onBuildFast: () => void
  onBuildMax: () => void
  onBuildFree: () => void
  onFeedback: (
    messageId: string,
    options?: {
      category?: FeedbackCategory
      footerMessage?: string
      errors?: Array<{ id: string; message: string }>
    },
  ) => void
  onCloseFeedback: () => void
}

interface MessageBlockStoreState {
  context: MessageBlockContext
  callbacks: MessageBlockCallbacks
}

interface MessageBlockStoreActions {
  /**
   * Batch update context values. Pass only the values you want to update.
   *
   * This is called from the Chat component whenever any of the dependent
   * values (theme, markdownPalette, messageTree, etc) change.
   */
  setContext: (context: Partial<MessageBlockContext>) => void
  /**
   * Replace all callbacks at once. These are typically stable functions set
   * up once when the Chat component mounts.
   */
  setCallbacks: (callbacks: MessageBlockCallbacks) => void
  /**
   * Reset the store to its initial state. Primarily used by tests.
   */
  reset: () => void
}

type MessageBlockStore = MessageBlockStoreState & MessageBlockStoreActions

const noop = () => {}
const noopFeedback: MessageBlockCallbacks['onFeedback'] = () => {}

const initialContext: MessageBlockContext = {
  theme: null,
  markdownPalette: null,
  messageTree: null,
  isWaitingForResponse: false,
  timerStartTime: null,
  availableWidth: 80,
}

const initialCallbacks: MessageBlockCallbacks = {
  onToggleCollapsed: noop,
  onBuildFast: noop,
  onBuildMax: noop,
  onBuildFree: noop,
  onFeedback: noopFeedback,
  onCloseFeedback: noop,
}

const initialState: MessageBlockStoreState = {
  context: initialContext,
  callbacks: initialCallbacks,
}

export const useMessageBlockStore = create<MessageBlockStore>()(
  immer((set) => ({
    ...initialState,

    setContext: (updates) =>
      set((state) => {
        state.context = { ...state.context, ...updates }
      }),

    setCallbacks: (callbacks) =>
      set((state) => {
        state.callbacks = callbacks
      }),

    reset: () =>
      set((state) => {
        state.context = { ...initialContext }
        state.callbacks = { ...initialCallbacks }
      }),
  })),
)
