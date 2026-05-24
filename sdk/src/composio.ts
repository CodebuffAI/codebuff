import { WEBSITE_URL } from './constants'

import type { CustomToolDefinition } from './custom-tool'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { JSONValue } from '@codebuff/common/types/json'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'

type ComposioToolsResponse = {
  sessionId: string
  tools: Array<{
    toolName: string
    inputSchema: Record<string, unknown>
    description: string
  }>
}

type ComposioExecuteResponse = {
  output: ToolResultOutput[]
}

const COMPOSIO_DISCOVERY_TIMEOUT_MS = 750
const COMPOSIO_DISCOVERY_SUCCESS_CACHE_MS = 5 * 60 * 1000
const COMPOSIO_DISCOVERY_FAILURE_CACHE_MS = 60 * 1000
const COMPOSIO_DISCOVERY_CACHE_MAX_ENTRIES = 64

const composioToolDefinitionsCache = new Map<
  string,
  { expiresAt: number; tools: CustomToolDefinition[] }
>()

function toJsonValue(value: unknown): JSONValue {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as JSONValue
  } catch {
    return String(value) as JSONValue
  }
}

function createTimeoutSignal(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new Error('Composio discovery timed out'))
  }, timeoutMs)
  const onAbort = () => controller.abort(parentSignal?.reason)

  if (parentSignal?.aborted) {
    onAbort()
  } else {
    parentSignal?.addEventListener('abort', onAbort, { once: true })
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      parentSignal?.removeEventListener('abort', onAbort)
    },
  }
}

function getCachedComposioTools(apiKey: string): CustomToolDefinition[] | null {
  const cached = composioToolDefinitionsCache.get(apiKey)
  if (!cached) return null
  if (Date.now() >= cached.expiresAt) {
    composioToolDefinitionsCache.delete(apiKey)
    return null
  }
  return cached.tools
}

function pruneComposioToolsCache(now: number) {
  for (const [apiKey, cached] of composioToolDefinitionsCache) {
    if (now >= cached.expiresAt) {
      composioToolDefinitionsCache.delete(apiKey)
    }
  }

  while (
    composioToolDefinitionsCache.size >= COMPOSIO_DISCOVERY_CACHE_MAX_ENTRIES
  ) {
    const oldest = composioToolDefinitionsCache.keys().next()
    if (oldest.done) break
    composioToolDefinitionsCache.delete(oldest.value)
  }
}

function cacheComposioTools(
  apiKey: string,
  tools: CustomToolDefinition[],
  ttlMs: number,
) {
  const now = Date.now()
  pruneComposioToolsCache(now)
  composioToolDefinitionsCache.set(apiKey, {
    tools,
    expiresAt: now + ttlMs,
  })
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: unknown
      message?: unknown
    }
    return String(body.error ?? body.message ?? response.statusText)
  } catch {
    return response.statusText
  }
}

async function executeComposioToolViaServer(params: {
  apiKey: string
  sessionId: string
  toolName: string
  input: Record<string, unknown>
}): Promise<ToolResultOutput[]> {
  try {
    const response = await fetch(
      new URL('/api/v1/composio/execute', WEBSITE_URL),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: params.sessionId,
          toolName: params.toolName,
          input: params.input,
        }),
      },
    )

    if (!response.ok) {
      return [
        {
          type: 'json',
          value: {
            errorMessage: await readErrorMessage(response),
            status: response.status,
          },
        },
      ]
    }

    const body = (await response.json()) as ComposioExecuteResponse
    return body.output
  } catch (error) {
    return [
      {
        type: 'json',
        value: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      },
    ]
  }
}

export async function getComposioCustomToolDefinitions(params: {
  apiKey: string
  logger?: Pick<Logger, 'warn'>
  signal?: AbortSignal
}): Promise<CustomToolDefinition[]> {
  const cachedTools = getCachedComposioTools(params.apiKey)
  if (cachedTools) return cachedTools
  if (params.signal?.aborted) return []

  const discoverySignal = createTimeoutSignal(
    params.signal,
    COMPOSIO_DISCOVERY_TIMEOUT_MS,
  )

  let response: Response
  try {
    response = await fetch(new URL('/api/v1/composio/tools', WEBSITE_URL), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
      signal: discoverySignal.signal,
    })
  } catch (error) {
    if (params.signal?.aborted) {
      return []
    }

    if (discoverySignal.signal.aborted) {
      params.logger?.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Timed out fetching Composio tools',
      )
      return []
    }

    cacheComposioTools(params.apiKey, [], COMPOSIO_DISCOVERY_FAILURE_CACHE_MS)
    params.logger?.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to fetch Composio tools',
    )
    return []
  } finally {
    discoverySignal.cleanup()
  }

  if (!response.ok) {
    cacheComposioTools(params.apiKey, [], COMPOSIO_DISCOVERY_FAILURE_CACHE_MS)
    if (response.status !== 503) {
      params.logger?.warn(
        { status: response.status, error: await readErrorMessage(response) },
        'Failed to fetch Composio tools',
      )
    }
    return []
  }

  try {
    const body = (await response.json()) as ComposioToolsResponse
    const tools = body.tools.map((tool) => ({
      toolName: tool.toolName,
      inputSchema: tool.inputSchema,
      description: tool.description,
      endsAgentStep: true,
      exampleInputs: [],
      execute: async (input: unknown) => {
        return executeComposioToolViaServer({
          apiKey: params.apiKey,
          sessionId: body.sessionId,
          toolName: tool.toolName,
          input:
            input && typeof input === 'object'
              ? (input as Record<string, unknown>)
              : { value: toJsonValue(input) },
        })
      },
    }))
    cacheComposioTools(
      params.apiKey,
      tools,
      COMPOSIO_DISCOVERY_SUCCESS_CACHE_MS,
    )
    return tools
  } catch (error) {
    cacheComposioTools(params.apiKey, [], COMPOSIO_DISCOVERY_FAILURE_CACHE_MS)
    params.logger?.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to parse Composio tools response',
    )
    return []
  }
}
