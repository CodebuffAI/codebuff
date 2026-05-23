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

function toJsonValue(value: unknown): JSONValue {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as JSONValue
  } catch {
    return String(value) as JSONValue
  }
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
}): Promise<CustomToolDefinition[]> {
  let response: Response
  try {
    response = await fetch(new URL('/api/v1/composio/tools', WEBSITE_URL), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
    })
  } catch (error) {
    params.logger?.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to fetch Composio tools',
    )
    return []
  }

  if (!response.ok) {
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
    return body.tools.map((tool) => ({
      toolName: tool.toolName,
      inputSchema: tool.inputSchema,
      description: tool.description,
      endsAgentStep: true,
      exampleInputs: [],
      execute: async (input) => {
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
  } catch (error) {
    params.logger?.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to parse Composio tools response',
    )
    return []
  }
}
