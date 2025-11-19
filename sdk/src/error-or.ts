import { failure, getErrorObject, type ErrorObject, type Failure } from '../../common/src/util/error'

// SDK-level error object that preserves optional code/status when present on Error instances
export type SdkErrorObject = ErrorObject & {
  code?: string
  status?: number
  originalError?: unknown
}

/**
 * Wrap an unknown error into a Failure<SdkErrorObject>, preserving `code`, `status`, and `originalError`
 * when present on known SDK error types like NetworkError or AuthenticationError.
 */
export function failureWithCode(error: unknown): Failure<SdkErrorObject> {
  if (error instanceof Error) {
    const base = getErrorObject(error)
    const anyErr = error as any

    const enriched: SdkErrorObject = {
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
