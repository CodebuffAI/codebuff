import { APICallError } from '@ai-sdk/provider'
import { z } from 'zod/v4'

import type { ZodType } from 'zod/v4'

export const openaiCompatibleErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),

    // The additional information below is handled loosely to support
    // OpenAI-compatible providers that have slightly different error
    // responses:
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),

    // OpenRouter provider failures put the upstream's own words here — for a
    // mid-stream refusal, `message` is often just "Provider returned error"
    // and `metadata.raw` is the only place the actual reason exists. Loose so
    // provider-specific extras (e.g. `error_type`) survive into responseBody.
    metadata: z
      .looseObject({
        raw: z.string().nullish(),
        provider_name: z.string().nullish(),
      })
      .nullish(),
  }),
})

export type OpenAICompatibleErrorData = z.infer<
  typeof openaiCompatibleErrorDataSchema
>

export type ProviderErrorStructure<T> = {
  errorSchema: ZodType<T>
  errorToMessage: (error: T) => string
  isRetryable?: (response: Response, error?: T) => boolean
}

export const defaultOpenAICompatibleErrorStructure: ProviderErrorStructure<OpenAICompatibleErrorData> =
  {
    errorSchema: openaiCompatibleErrorDataSchema,
    errorToMessage: (data) => data.error.message,
  }

// Matches buildEnhancedErrorMessage on the server (web/src/llm-api/
// openrouter.ts), which applies the same bound to upstream prose.
const MAX_PROVIDER_DETAIL_LENGTH = 1000

/**
 * Convert a mid-stream error chunk into an APICallError that carries
 * everything the failed-response path already gives clients.
 *
 * Error chunks arrive inside an HTTP 200 stream, so they bypass the JSON
 * error response handler entirely. Surfacing only `error.message` here left
 * the user-facing failure as the provider's generic wording ("Provider
 * returned error") with the actual reason discarded in `metadata.raw`, and —
 * with no statusCode or responseBody for extractApiErrorDetails to find —
 * every client rendered it behind an "Agent run error:" prefix with no
 * detail. This builds the same `message [provider: raw]` form the server's
 * parseOpenRouterError produces for non-stream failures, and encodes the
 * result as a responseBody so downstream error extraction treats both
 * failure shapes identically.
 */
export function streamErrorChunkToApiCallError(params: {
  errorValue: unknown
  url: string
  requestBodyValues: unknown
}): APICallError {
  const { errorValue, url, requestBodyValues } = params
  const error =
    errorValue && typeof errorValue === 'object'
      ? (errorValue as {
          message?: unknown
          code?: unknown
          metadata?: { raw?: unknown; provider_name?: unknown } | null
        })
      : {}

  const baseMessage =
    typeof error.message === 'string' && error.message.length > 0
      ? error.message
      : JSON.stringify(errorValue)

  const raw =
    typeof error.metadata?.raw === 'string' && error.metadata.raw.length > 0
      ? error.metadata.raw
      : undefined
  const providerLabel =
    typeof error.metadata?.provider_name === 'string'
      ? error.metadata.provider_name
      : 'Provider details'
  const truncatedRaw =
    raw !== undefined && raw.length > MAX_PROVIDER_DETAIL_LENGTH
      ? raw.slice(0, MAX_PROVIDER_DETAIL_LENGTH) + '...'
      : raw
  const message =
    truncatedRaw !== undefined
      ? `${baseMessage} [${providerLabel}: ${truncatedRaw}]`
      : baseMessage

  // OpenRouter puts the upstream HTTP status in `code` as a number; some
  // providers send it as a digit string.
  const statusCode =
    typeof error.code === 'number' && Number.isInteger(error.code)
      ? error.code
      : typeof error.code === 'string' && /^\d{3}$/.test(error.code)
        ? Number(error.code)
        : undefined

  return new APICallError({
    message,
    url,
    requestBodyValues,
    statusCode,
    responseBody: JSON.stringify({ error: { ...error, message } }),
  })
}
