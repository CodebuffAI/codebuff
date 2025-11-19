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
}

export function success<T>(value: T): Success<T> {
  return {
    success: true,
    value,
  }
}

export function failure(error: any): Failure<ErrorObject> {
  return {
    success: false,
    error: getErrorObject(error),
  }
}

export function getErrorObject(error: any): ErrorObject {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return {
    name: 'Error',
    message: `${error}`,
  }
}

/**
 * Extended error object that can preserve additional metadata like code, status, and originalError
 * from Error instances (e.g., NetworkError, AuthenticationError).
 */
export type ExtendedErrorObject = ErrorObject & {
  code?: string
  status?: number
  originalError?: unknown
}

/**
 * Wrap an unknown error into a Failure<ExtendedErrorObject>, preserving `code`, `status`, and `originalError`
 * when present on Error instances.
 *
 * This is useful for converting thrown errors into ErrorOr results while maintaining error metadata.
 *
 * @example
 * ```typescript
 * try {
 *   await somethingThatMightThrow()
 *   return success(result)
 * } catch (error) {
 *   return failureWithCode(error)
 * }
 * ```
 */
export function failureWithCode(error: unknown): Failure<ExtendedErrorObject> {
  if (error instanceof Error) {
    const base = getErrorObject(error)
    const anyErr = error as any

    const enriched: ExtendedErrorObject = {
      ...base,
    }

    if (typeof anyErr.code === 'string') {
      enriched.code = anyErr.code
    }

    if (typeof anyErr.status === 'number') {
      enriched.status = anyErr.status
    }

    if ('originalError' in anyErr) {
      enriched.originalError = anyErr.originalError
    }

    return {
      success: false,
      error: enriched,
    }
  }

  // Fallback to base failure, which will still give us an ErrorObject
  return failure(error)
}
