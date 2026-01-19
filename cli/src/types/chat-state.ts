/**
 * Type definitions for chat state management.
 * Re-exports types from the extracted hooks for convenience.
 */

// Re-export types from the extracted hooks
export type {
  ChatStateRefs,
  UseChatStateReturn,
} from '../hooks/use-chat-state'

export type {
  UseChatMessagesOptions,
  UseChatMessagesReturn,
} from '../hooks/use-chat-messages'

// Re-export StreamStatus from use-message-queue for convenience
export type { StreamStatus } from '../hooks/use-message-queue'
