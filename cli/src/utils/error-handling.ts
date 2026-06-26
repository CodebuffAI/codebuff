import type { ChatMessage } from '../types/chat'
import { logger } from './logger'

// Normalize unknown errors to a user-facing string. The full stack trace is
// logged internally (via logger.error) for diagnosis but is never surfaced to
// the user-facing message, which could leak internal file paths and frames.
const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string') {
    return error
  }
  if (error instanceof Error && error.message) {
    // Log the stack internally for debugging; do NOT include it in the
    // returned user-facing string.
    if (error.stack) {
      logger.error({ err: error }, 'Error surfaced to user')
    }
    return error.message
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const candidate = (error as { message: unknown }).message
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
  }
  return fallback
}

export const createErrorMessage = (
  error: unknown,
  aiMessageId: string,
): Partial<ChatMessage> => {
  const message = extractErrorMessage(error, 'Unknown error occurred')

  return {
    id: aiMessageId,
    content: `**Error:** ${message}`,
    blocks: undefined,
    isComplete: true,
  }
}
