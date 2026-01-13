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

export function getErrorObject(
  error: unknown,
  options: { includeRawError?: boolean } = {},
): ErrorObject {
  if (error instanceof Error) {
    const errorWithExtras = error as { status?: unknown; statusCode?: unknown; code?: unknown }
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      status: typeof errorWithExtras.status === 'number' ? errorWithExtras.status : undefined,
      statusCode:
        typeof errorWithExtras.statusCode === 'number'
          ? errorWithExtras.statusCode
          : undefined,
      code: typeof errorWithExtras.code === 'string' ? errorWithExtras.code : undefined,
      rawError: options.includeRawError
        ? JSON.stringify(error, null, 2)
        : undefined,
    }
  }

  return {
    name: 'Error',
    message: `${error}`,
  }
}
