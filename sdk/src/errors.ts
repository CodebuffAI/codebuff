/**
 * SDK Error Types and Utilities
 *
 * This module defines typed errors for the Codebuff SDK, including:
 * - AuthenticationError: 401/403 responses indicating invalid credentials
 * - NetworkError: Network failures, timeouts, 5xx errors
 * - Error codes for categorizing failures
 * - Type guards for runtime error checking
 * - Utilities for sanitizing error messages
 *
 * @example
 * ```typescript
 * import { AuthenticationError, isNetworkError, RETRYABLE_ERROR_CODES } from '@codebuff/sdk'
 *
 * try {
 *   await getUserInfoFromApiKey({ apiKey, fields, logger })
 * } catch (error) {
 *   if (isAuthenticationError(error)) {
 *     // Show login modal
 *   } else if (isNetworkError(error)) {
 *     // Show network error, schedule retry
 *   }
 * }
 * ```
 */

/**
 * Error codes for categorizing SDK errors
 */
export const ErrorCodes = {
  // Authentication errors (401, 403)
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  INVALID_API_KEY: 'INVALID_API_KEY',
  FORBIDDEN: 'FORBIDDEN',

  // Payment errors (402)
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',

  // Network errors (timeouts, DNS failures, connection refused)
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  CONNECTION_REFUSED: 'CONNECTION_REFUSED',
  DNS_FAILURE: 'DNS_FAILURE',

  // Server errors (5xx)
  SERVER_ERROR: 'SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Client errors (4xx, excluding auth)
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',

  // Other errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

/**
 * Error codes that should trigger automatic retry
 */
export const RETRYABLE_ERROR_CODES = new Set<ErrorCode>([
  ErrorCodes.NETWORK_ERROR,
  ErrorCodes.TIMEOUT,
  ErrorCodes.CONNECTION_REFUSED,
  ErrorCodes.DNS_FAILURE,
  ErrorCodes.SERVER_ERROR,
  ErrorCodes.SERVICE_UNAVAILABLE,
])

/**
 * Authentication error class
 * Thrown when API returns 401 or 403 status codes
 */
export class AuthenticationError extends Error {
  public readonly code: ErrorCode
  public readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AuthenticationError'
    this.status = status

    if (status === 401) {
      this.code = ErrorCodes.AUTHENTICATION_FAILED
    } else if (status === 403) {
      this.code = ErrorCodes.FORBIDDEN
    } else {
      this.code = ErrorCodes.INVALID_API_KEY
    }

    // Maintains proper stack trace for where error was thrown (V8 engines only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthenticationError)
    }
  }
}

/**
 * Payment required error class
 * Thrown when API returns 402 status code (insufficient credits)
 */
export class PaymentRequiredError extends Error {
  public readonly code = ErrorCodes.PAYMENT_REQUIRED
  public readonly status = 402

  constructor(message: string) {
    super(message)
    this.name = 'PaymentRequiredError'

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PaymentRequiredError)
    }
  }
}

/**
 * Network error class
 * Thrown for network failures, timeouts, and server errors (5xx)
 */
export class NetworkError extends Error {
  public readonly code: ErrorCode
  public readonly status?: number
  public readonly originalError?: unknown

  constructor(message: string, code: ErrorCode, status?: number, originalError?: unknown) {
    super(message)
    this.name = 'NetworkError'
    this.code = code
    this.status = status
    this.originalError = originalError

    // Maintains proper stack trace for where error was thrown (V8 engines only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NetworkError)
    }
  }
}

/**
 * Type guard to check if an error is an AuthenticationError
 */
export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError
}

/**
 * Type guard to check if an error is a PaymentRequiredError
 */
export function isPaymentRequiredError(error: unknown): error is PaymentRequiredError {
  return error instanceof PaymentRequiredError
}

/**
 * Type guard to check if an error is a NetworkError
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError
}

/**
 * Type guard to check if an error has an error code property
 */
export function isErrorWithCode(error: unknown): error is { code: ErrorCode } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as any).code === 'string'
  )
}

/**
 * Sanitizes error messages for display
 * Removes sensitive information and formats for user consumption
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (isAuthenticationError(error)) {
    if (error.status === 401) {
      return 'Authentication failed. Please check your API key.'
    } else if (error.status === 403) {
      return 'Access forbidden. You do not have permission to access this resource.'
    }
    return 'Invalid API key. Please check your credentials.'
  }

  if (isPaymentRequiredError(error)) {
    return error.message
  }

  if (isNetworkError(error)) {
    switch (error.code) {
      case ErrorCodes.TIMEOUT:
        return 'Request timed out. Please check your internet connection.'
      case ErrorCodes.CONNECTION_REFUSED:
        return 'Connection refused. The server may be down.'
      case ErrorCodes.DNS_FAILURE:
        return 'DNS resolution failed. Please check your internet connection.'
      case ErrorCodes.SERVER_ERROR:
      case ErrorCodes.SERVICE_UNAVAILABLE:
        return 'Server error. Please try again later.'
      default:
        return 'Network error. Please check your internet connection.'
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
