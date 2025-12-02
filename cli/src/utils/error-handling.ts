import { ErrorCodes, isPaymentRequiredError } from '@codebuff/sdk'

import type { ChatMessage } from '../types/chat'

const defaultAppUrl =
  process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'https://codebuff.com'

// Normalize unknown errors to a user-facing string.
const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string') {
    return error
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const candidate = (error as any).message
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
  }
  return fallback
}

export const isOutOfCreditsError = (error: unknown): boolean => {
  if (isPaymentRequiredError(error)) {
    return true
  }

  if (
    error &&
    typeof error === 'object' &&
    'errorCode' in error &&
    (error as any).errorCode === ErrorCodes.PAYMENT_REQUIRED
  ) {
    return true
  }

  return false
}

export const createPaymentErrorMessage = (error: unknown): {
  message: string
  showUsageBanner: boolean
} => {
  const fallback = `Out of credits. Please add credits at ${defaultAppUrl}/usage`
  const message = extractErrorMessage(error, fallback)

  return {
    message,
    showUsageBanner: isOutOfCreditsError(error),
  }
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

// Re-export for convenience in helpers
export { isPaymentRequiredError }
