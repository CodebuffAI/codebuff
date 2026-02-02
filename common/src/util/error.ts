export type ErrorOr<T, E extends ErrorObject = ErrorObject> =
  | Success<T>
  | Failure<E>

export type Success<T> = {
  success: true
  value: T
}

export type Failure<E extends ErrorObject = ErrorObject> = {
  success: false
  error: E
}

/**
 * Result type for prompt functions that can be aborted.
 * Provides rich semantics to distinguish between successful completion and user abort.
 *
 * ## When to use `PromptResult<T>` vs `ErrorOr<T>`
 *
 * Use `PromptResult<T>` when:
 * - The operation can be cancelled by the user (via AbortSignal)
 * - An abort is an expected outcome, not an error
 * - You need to distinguish between errors (which might trigger fallbacks) and
 *   user-initiated aborts (which should propagate immediately)
 *
 * Use `ErrorOr<T>` when:
 * - The operation can fail with an error that should be handled
 * - There's no concept of user-initiated abort
 * - You want to return error details rather than throw
 *
 * ## Abort handling patterns
 *
 * 1. **Check and return early** - For graceful handling where abort means "stop, no error":
 *    ```ts
 *    const result = await promptAiSdk({ ... })
 *    if (result.aborted) return // or return null, false, etc.
 *    doSomething(result.value)
 *    ```
 *
 * 2. **Unwrap and throw** - For propagating aborts as exceptions:
 *    ```ts
 *    const value = unwrapPromptResult(await promptAiSdk({ ... }))
 *    // Throws if aborted, callers should use isAbortError() in catch blocks
 *    ```
 *
 * 3. **Rethrow in catch blocks** - Prevent swallowing abort errors:
 *    ```ts
 *    try {
 *      await someOperation()
 *    } catch (error) {
 *      if (isAbortError(error)) throw error // Don't swallow aborts
 *      // Handle other errors
 *    }
 *    ```
 */
export type PromptResult<T> = PromptSuccess<T> | PromptAborted

export type PromptSuccess<T> = {
  aborted: false
  value: T
}

export type PromptAborted = {
  aborted: true
  reason?: string
}

export type ErrorObject = {
  name: string
  message: string
  stack?: string
  /** HTTP status code from error.status (used by some libraries) */
  status?: number
  /** HTTP status code from error.statusCode (used by AI SDK and Codebuff errors) */
  statusCode?: number
  /** Optional machine-friendly error code, if available */
  code?: string
  /** Optional raw error object */
  rawError?: string
  /** Response body from API errors (AI SDK APICallError) */
  responseBody?: string
  /** URL that was called (API errors) */
  url?: string
  /** Whether the error is retryable (API errors) */
  isRetryable?: boolean
  /** Request body values that were sent (API errors) - stringified for safety */
  requestBodyValues?: string
  /** Cause of the error, if nested */
  cause?: ErrorObject
}

export function success<T>(value: T): Success<T> {
  return {
    success: true,
    value,
  }
}

export function failure(error: unknown): Failure<ErrorObject> {
  return {
    success: false,
    error: getErrorObject(error),
  }
}

/**
 * Create a successful prompt result.
 */
export function promptSuccess<T>(value: T): PromptSuccess<T> {
  return {
    aborted: false,
    value,
  }
}

/**
 * Create an aborted prompt result.
 */
export function promptAborted(reason?: string): PromptAborted {
  return {
    aborted: true,
    ...(reason !== undefined && { reason }),
  }
}

/**
 * Standard error message for aborted requests.
 * Use this constant when throwing abort errors to ensure consistency.
 */
export const ABORT_ERROR_MESSAGE = 'Request aborted'

/**
 * Custom error class for abort errors.
 * Use this class instead of generic Error for abort errors to ensure
 * robust detection via isAbortError() (checks error.name === 'AbortError').
 */
export class AbortError extends Error {
  constructor(reason?: string) {
    super(reason ? `${ABORT_ERROR_MESSAGE}: ${reason}` : ABORT_ERROR_MESSAGE)
    this.name = 'AbortError'
  }
}

/**
 * Check if an error is an abort error.
 * Use this helper to detect abort errors in catch blocks.
 *
 * Detects both:
 * - Errors with message starting with 'Request aborted' (thrown by our code via AbortError)
 * - Native AbortError (thrown by fetch/AI SDK when AbortSignal is triggered)
 */
export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  // Check for our custom abort error message:
  // - Exact match: 'Request aborted'
  // - With reason: 'Request aborted: <reason>' (from AbortError class)
  if (
    error.message === ABORT_ERROR_MESSAGE ||
    error.message.startsWith(`${ABORT_ERROR_MESSAGE}: `)
  ) {
    return true
  }
  // Check for native AbortError (DOMException or Error with name 'AbortError')
  // This is thrown by fetch, AI SDK, and other web APIs when AbortSignal is triggered
  if (error.name === 'AbortError') {
    return true
  }
  return false
}

/**
 * Unwrap a PromptResult, returning the value if successful or throwing if aborted.
 *
 * Use this helper for consistent abort handling when you want aborts to propagate
 * as exceptions. Callers should use `isAbortError()` in catch blocks to detect
 * and handle abort errors appropriately (e.g., rethrow instead of logging as errors).
 *
 * @throws {AbortError} When result.aborted is true.
 */
export function unwrapPromptResult<T>(result: PromptResult<T>): T {
  if (result.aborted) {
    throw new AbortError(result.reason)
  }
  return result.value
}

// Extended error properties that various libraries add to Error objects
interface ExtendedErrorProperties {
  status?: number
  statusCode?: number
  code?: string
  // API error properties (AI SDK APICallError, etc.)
  responseBody?: string
  url?: string
  isRetryable?: boolean
  requestBodyValues?: Record<string, unknown>
  cause?: unknown
}

/**
 * Safely stringify an object, handling circular references and large objects.
 */
function safeStringify(value: unknown, maxLength = 10000): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value.slice(0, maxLength)
  try {
    const seen = new WeakSet()
    const str = JSON.stringify(
      value,
      (_, val) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[Circular]'
          seen.add(val)
        }
        return val
      },
      2,
    )
    return str?.slice(0, maxLength)
  } catch {
    return '[Unable to stringify]'
  }
}

export function getErrorObject(
  error: unknown,
  options: { includeRawError?: boolean } = {},
): ErrorObject {
  if (error instanceof Error) {
    const extError = error as Error & Partial<ExtendedErrorProperties>

    // Extract responseBody - could be string or object
    let responseBody: string | undefined
    if (extError.responseBody !== undefined) {
      responseBody = safeStringify(extError.responseBody)
    }

    // Extract requestBodyValues - typically an object, stringify for logging
    let requestBodyValues: string | undefined
    if (
      extError.requestBodyValues !== undefined &&
      typeof extError.requestBodyValues === 'object'
    ) {
      requestBodyValues = safeStringify(extError.requestBodyValues)
    }

    // Extract cause - recursively convert to ErrorObject if present
    let cause: ErrorObject | undefined
    if (extError.cause !== undefined) {
      cause = getErrorObject(extError.cause, options)
    }

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      status: typeof extError.status === 'number' ? extError.status : undefined,
      statusCode:
        typeof extError.statusCode === 'number'
          ? extError.statusCode
          : undefined,
      code: typeof extError.code === 'string' ? extError.code : undefined,
      rawError: options.includeRawError
        ? safeStringify(error)
        : undefined,
      // API error fields
      responseBody,
      url: typeof extError.url === 'string' ? extError.url : undefined,
      isRetryable:
        typeof extError.isRetryable === 'boolean'
          ? extError.isRetryable
          : undefined,
      requestBodyValues,
      cause,
    }
  }

  return {
    name: 'Error',
    message: `${error}`,
  }
}
