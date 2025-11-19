/**
 * Custom error classes for the SDK
 */

/**
 * Standard error codes used throughout the SDK
 */
export const ErrorCodes = {
  AUTH_FAILED: 'AUTH_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
  CONNECTION_LOST: 'CONNECTION_LOST',
  ECONNRESET: 'ECONNRESET',
  ABORTED: 'ABORTED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

/**
 * Set of error codes that should trigger automatic retry
 */
export const RETRYABLE_ERROR_CODES = new Set<ErrorCode>([
  ErrorCodes.NETWORK_ERROR,
  ErrorCodes.TIMEOUT,
  ErrorCodes.CONNECTION_LOST,
  ErrorCodes.ECONNRESET,
])

/**
 * Sanitizes error messages by removing unhelpful system messages
 */
function sanitizeErrorMessage(message: string): string {
  // Remove unhelpful browser/system error message
  return message.replace(/Is the computer able to access the url\?\s*/g, '').trim()
}

export interface ErrorWithCode extends Error {
  code: string
}

export interface ErrorWithStatus extends ErrorWithCode {
  status: number
}

export interface NetworkErrorDetails extends ErrorWithCode {
  status?: number
  originalError?: any
  streamTimedOut?: boolean
}

/**
 * Error thrown when authentication fails (401/403)
 */
export class AuthenticationError extends Error implements ErrorWithStatus {
  code = 'AUTH_FAILED' as const
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AuthenticationError'
    this.status = status
    Object.setPrototypeOf(this, AuthenticationError.prototype)
  }
}

/**
 * Error thrown when network/server issues occur
 */
export class NetworkError extends Error implements NetworkErrorDetails {
  code = 'NETWORK_ERROR' as const
  status?: number
  originalError?: any
  streamTimedOut?: boolean

  constructor(
    message: string,
    options?: { status?: number; originalError?: any; streamTimedOut?: boolean },
  ) {
    super(sanitizeErrorMessage(message))
    this.name = 'NetworkError'
    this.status = options?.status
    this.originalError = options?.originalError
    this.streamTimedOut = options?.streamTimedOut
    Object.setPrototypeOf(this, NetworkError.prototype)
  }
}

/**
 * Type guard to check if an error is an AuthenticationError
 */
export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError ||
    (error instanceof Error && 'code' in error && error.code === 'AUTH_FAILED')
}

/**
 * Type guard to check if an error is a NetworkError
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError ||
    (error instanceof Error && 'code' in error && error.code === 'NETWORK_ERROR')
}

/**
 * Type guard to check if an error has a code property
 */
export function isErrorWithCode(error: unknown): error is ErrorWithCode {
  return error instanceof Error && 'code' in error
}
