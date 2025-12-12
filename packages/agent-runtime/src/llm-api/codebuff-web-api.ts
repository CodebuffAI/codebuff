import { withTimeout } from '@codebuff/common/util/promise'
import type { ClientEnv, CiEnv } from '@codebuff/common/types/contracts/env'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const FETCH_TIMEOUT_MS = 30_000

interface CodebuffWebApiEnv {
  clientEnv: ClientEnv
  ciEnv: CiEnv
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
  const baseUrl = params.baseUrl ?? env.clientEnv.NEXT_PUBLIC_CODEBUFF_APP_URL
  const apiKey = params.apiKey ?? env.ciEnv.CODEBUFF_API_KEY

  if (!baseUrl || !apiKey) {
    return { error: 'Missing Codebuff base URL or API key' }
  }

  const url = `${baseUrl}/api/v1/web-search`
  const payload = { query, depth, ...(repoUrl ? { repoUrl } : {}) }

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
    const tryJson = () => {
      try {
        return JSON.parse(text)
      } catch {
        return null
      }
    }

    if (!res.ok) {
      const maybe = tryJson()
      const err =
        (maybe && (maybe.error || maybe.message)) || text || 'Request failed'
      logger.warn(
        {
          url,
          status: res.status,
          statusText: res.statusText,
          body: text?.slice(0, 500),
        },
        'Web API web-search request failed',
      )
      return { error: typeof err === 'string' ? err : 'Unknown error' }
    }

    const data = tryJson()
    if (data && typeof data.result === 'string') {
      return {
        result: data.result,
        creditsUsed:
          typeof data.creditsUsed === 'number' ? data.creditsUsed : undefined,
      }
    }
    if (data && typeof data.error === 'string') return { error: data.error }
    return { error: 'Invalid response format' }
  } catch (error) {
    logger.error(
      {
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
      },
      'Web API web-search network error',
    )
    return { error: error instanceof Error ? error.message : 'Network error' }
  }
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
  const baseUrl = params.baseUrl ?? env.clientEnv.NEXT_PUBLIC_CODEBUFF_APP_URL
  const apiKey = params.apiKey ?? env.ciEnv.CODEBUFF_API_KEY

  if (!baseUrl || !apiKey) {
    return { error: 'Missing Codebuff base URL or API key' }
  }

  const url = `${baseUrl}/api/v1/docs-search`
  const payload: Record<string, any> = { libraryTitle }
  if (topic) payload.topic = topic
  if (typeof maxTokens === 'number') payload.maxTokens = maxTokens
  if (repoUrl) payload.repoUrl = repoUrl

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
    const tryJson = () => {
      try {
        return JSON.parse(text) as any
      } catch {
        return null
      }
    }

    if (!res.ok) {
      const maybe = tryJson()
      const err =
        (maybe && (maybe.error || maybe.message)) || text || 'Request failed'
      logger.warn(
        {
          url,
          status: res.status,
          statusText: res.statusText,
          body: text?.slice(0, 500),
        },
        'Web API docs-search request failed',
      )
      return { error: typeof err === 'string' ? err : 'Unknown error' }
    }

    const data = tryJson()
    if (data && typeof data.documentation === 'string') {
      return {
        documentation: data.documentation,
        creditsUsed:
          typeof data.creditsUsed === 'number' ? data.creditsUsed : undefined,
      }
    }
    if (data && typeof data.error === 'string') return { error: data.error }
    return { error: 'Invalid response format' }
  } catch (error) {
    logger.error(
      {
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
      },
      'Web API docs-search network error',
    )
    return { error: error instanceof Error ? error.message : 'Network error' }
  }
}
