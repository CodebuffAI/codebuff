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
  /** Optional numeric HTTP status code, if available */
  status?: number
  /** Optional machine-friendly error code, if available */
  code?: string
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
    const anyError = error as any

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      status: typeof anyError.status === 'number' ? anyError.status : undefined,
      code: typeof anyError.code === 'string' ? anyError.code : undefined,
    }
  }

  // Non-Error values - best effort stringification
  return {
    name: 'Error',
    message: `${error}`,
  }
}
