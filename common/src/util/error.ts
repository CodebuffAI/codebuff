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
