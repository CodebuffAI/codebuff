import type { ChatMessage } from '../types/chat'

// Normalize unknown errors to a user-facing string.
const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string') {
    return error
  }
  if (error instanceof Error && error.message) {
    return error.message + (error.stack ? `\n\n${error.stack}` : '')
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
