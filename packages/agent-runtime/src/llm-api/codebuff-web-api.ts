import { withTimeout } from '@codebuff/common/util/promise'
import type { ClientEnv, CiEnv } from '@codebuff/common/types/contracts/env'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const FETCH_TIMEOUT_MS = 30_000

interface CodebuffWebApiEnv {
  clientEnv: ClientEnv
  ciEnv: CiEnv
}

const tryParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const getStringField = (value: unknown, key: string): string | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const field = record[key]
  return typeof field === 'string' ? field : undefined
}

const getNumberField = (value: unknown, key: string): number | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const field = record[key]
  return typeof field === 'number' ? field : undefined
}

const callCodebuffV1 = async (params: {
  endpoint: '/api/v1/web-search' | '/api/v1/docs-search'
  payload: unknown
  fetch: typeof globalThis.fetch
  logger: Logger
  env: CodebuffWebApiEnv
  baseUrl?: string
  apiKey?: string
  requestName: 'web-search' | 'docs-search'
}): Promise<{ json?: unknown; error?: string; creditsUsed?: number }> => {
  const { endpoint, payload, fetch, logger, env, requestName } = params
  const baseUrl = params.baseUrl ?? env.clientEnv.NEXT_PUBLIC_CODEBUFF_APP_URL
  const apiKey = params.apiKey ?? env.ciEnv.CODEBUFF_API_KEY

  if (!baseUrl || !apiKey) {
    return { error: 'Missing Codebuff base URL or API key' }
  }

  const url = `${baseUrl}${endpoint}`

  try {
    const res = await withTimeout(
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'x-codebuff-api-key': apiKey,
        },
        body: JSON.stringify(payload),
      }),
      FETCH_TIMEOUT_MS,
    )

    const text = await res.text()
    const json = tryParseJson(text)

    if (!res.ok) {
      const err =
        getStringField(json, 'error') ??
        getStringField(json, 'message') ??
        text ??
        'Request failed'
      logger.warn(
        {
          url,
          status: res.status,
          statusText: res.statusText,
          body: text?.slice(0, 500),
        },
        `Web API ${requestName} request failed`,
      )
      return { error: err }
    }

    return { json, creditsUsed: getNumberField(json, 'creditsUsed') }
  } catch (error) {
    logger.error(
      {
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
      },
      `Web API ${requestName} network error`,
    )
    return { error: error instanceof Error ? error.message : 'Network error' }
  }
}

export async function callWebSearchAPI(params: {
  query: string
  depth?: 'standard' | 'deep'
  repoUrl?: string | null
  fetch: typeof globalThis.fetch
  logger: Logger
  env: CodebuffWebApiEnv
  baseUrl?: string
  apiKey?: string
}): Promise<{ result?: string; error?: string; creditsUsed?: number }> {
  const { query, depth = 'standard', repoUrl, fetch, logger, env } = params
  const payload = { query, depth, ...(repoUrl ? { repoUrl } : {}) }

  const res = await callCodebuffV1({
    endpoint: '/api/v1/web-search',
    payload,
    fetch,
    logger,
    env,
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    requestName: 'web-search',
  })
  if (res.error) return { error: res.error }

  const result = getStringField(res.json, 'result')
  if (result) {
    return { result, creditsUsed: res.creditsUsed }
  }

  const error = getStringField(res.json, 'error')
  return { error: error ?? 'Invalid response format' }
}

export async function callDocsSearchAPI(params: {
  libraryTitle: string
  topic?: string
  maxTokens?: number
  repoUrl?: string | null
  fetch: typeof globalThis.fetch
  logger: Logger
  env: CodebuffWebApiEnv
  baseUrl?: string
  apiKey?: string
}): Promise<{ documentation?: string; error?: string; creditsUsed?: number }> {
  const { libraryTitle, topic, maxTokens, repoUrl, fetch, logger, env } = params
  const payload: Record<string, unknown> = { libraryTitle }
  if (topic) payload.topic = topic
  if (typeof maxTokens === 'number') payload.maxTokens = maxTokens
  if (repoUrl) payload.repoUrl = repoUrl

  const res = await callCodebuffV1({
    endpoint: '/api/v1/docs-search',
    payload,
    fetch,
    logger,
    env,
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    requestName: 'docs-search',
  })
  if (res.error) return { error: res.error }

  const documentation = getStringField(res.json, 'documentation')
  if (documentation) {
    return { documentation, creditsUsed: res.creditsUsed }
  }

  const error = getStringField(res.json, 'error')
  return { error: error ?? 'Invalid response format' }
}
