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
  code: string
  status?: number
  originalError?: unknown
}

export function success<T>(value: T): Success<T> {
  return {
    success: true,
    value,
  }
}

export function failure(error: any): Failure<ErrorObject> {
  if (error instanceof Error) {
    const base = getErrorObject(error)
    
    // Safely extract code, status, and originalError if present
    const errorWithMetadata = error as Error & {
      code?: string
      status?: number
      originalError?: unknown
    }

    return {
      success: false,
      error: {
        ...base,
        code: typeof errorWithMetadata.code === 'string' ? errorWithMetadata.code : 'UNKNOWN_ERROR',
        ...(typeof errorWithMetadata.status === 'number' && { status: errorWithMetadata.status }),
        ...('originalError' in errorWithMetadata && { originalError: errorWithMetadata.originalError }),
      },
    }
  }

  return {
    success: false,
    error: {
      ...getErrorObject(error),
      code: 'UNKNOWN_ERROR',
    },
  }
}

export function getErrorObject(error: any): ErrorObject {
  if (error instanceof Error) {
    const errorWithCode = error as Error & { code?: string }
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: typeof errorWithCode.code === 'string' ? errorWithCode.code : 'UNKNOWN_ERROR',
    }
  }

  return {
    name: 'Error',
    message: `${error}`,
    code: 'UNKNOWN_ERROR',
  }
}


