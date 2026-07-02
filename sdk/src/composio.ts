import { getWebsiteUrl } from './constants'

import type { ComposioMetaToolName } from '@codebuff/common/constants/composio'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'

type ComposioExecuteResponse = {
  output: ToolResultOutput[]
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

export async function executeComposioToolViaServer(params: {
  apiKey: string
  toolName: ComposioMetaToolName
  input: Record<string, unknown>
}): Promise<ToolResultOutput[]> {
  try {
    const response = await fetch(
      new URL('/api/v1/composio/execute', getWebsiteUrl()),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
    if (!Array.isArray(body.output)) {
      return [
        {
          type: 'json',
          value: {
            errorMessage: 'Invalid Composio execute response from server',
          },
        },
      ]
    }
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
