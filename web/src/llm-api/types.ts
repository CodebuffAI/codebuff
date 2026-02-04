import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { InsertMessageBigqueryFn } from '@codebuff/common/types/contracts/bigquery'

export interface CodebuffMetadata {
  client_id?: string
  run_id?: string
  n?: number
  cost_mode?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  name?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
}

export interface ChatCompletionRequestBody {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  max_completion_tokens?: number
  top_p?: number
  frequency_penalty?: number
  presence_penalty?: number
  stop?: string | string[]
  reasoning?: {
    enabled?: boolean
    effort?: 'high' | 'medium' | 'low'
  }
  reasoning_effort?: 'high' | 'medium' | 'low'
  provider?: Record<string, unknown>
  transforms?: string[]
  usage?: {
    include?: boolean
  }
  codebuff_metadata?: CodebuffMetadata
}

/**
 * Type guard to check if a value is a valid ChatCompletionRequestBody
 */
export function isChatCompletionRequestBody(
  value: unknown,
): value is ChatCompletionRequestBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'model' in value &&
    typeof (value as Record<string, unknown>).model === 'string' &&
    'messages' in value &&
    Array.isArray((value as Record<string, unknown>).messages)
  )
}

/**
 * Type guard to check if a value is CodebuffMetadata
 */
export function isCodebuffMetadata(
  value: unknown,
): value is CodebuffMetadata {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const v = value as Record<string, unknown>
  return (
    (v.client_id === undefined || typeof v.client_id === 'string') &&
    (v.run_id === undefined || typeof v.run_id === 'string') &&
    (v.n === undefined || typeof v.n === 'number') &&
    (v.cost_mode === undefined || typeof v.cost_mode === 'string')
  )
}

/**
 * Parameters for OpenRouter/LLM handler functions
 */
export interface LLMHandlerParams {
  body: ChatCompletionRequestBody
  userId: string
  stripeCustomerId?: string | null
  agentId: string
  openrouterApiKey: string | null
  fetch: typeof globalThis.fetch
  logger: Logger
  insertMessageBigquery: InsertMessageBigqueryFn
}

/**
 * Raw response from OpenRouter API (non-streaming)
 */
export interface OpenRouterResponse {
  id: string
  model: string
  choices: Array<{
    index?: number
    message?: {
      content?: string | null
      reasoning?: string | null
      role?: string
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    cost?: number
    cost_details?: {
      upstream_inference_cost?: number | null
    } | null
    prompt_tokens_details?: {
      cached_tokens?: number
    } | null
    completion_tokens_details?: {
      reasoning_tokens?: number
    } | null
  }
}

/**
 * Error metadata from OpenRouter provider
 */
export interface OpenRouterErrorMetadata {
  raw?: string
  provider_name?: string
}

/**
 * Raw error response from OpenRouter API
 */
export interface OpenRouterErrorResponse {
  error: {
    message: string
    code: string | number | null
    type?: string | null
    param?: unknown
    metadata?: OpenRouterErrorMetadata
  }
}
