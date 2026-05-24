import { COMPOSIO_META_TOOL_NAMES } from '@codebuff/common/constants/composio'
import { z } from 'zod/v4'

import { WEBSITE_URL } from './constants'

import type { ComposioMetaToolName } from '@codebuff/common/constants/composio'
import type { CustomToolDefinition } from './custom-tool'
import type { JSONValue } from '@codebuff/common/types/json'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'

type ComposioExecuteResponse = {
  output: ToolResultOutput[]
}

const sessionIdParam = z
  .string()
  .optional()
  .describe('Session ID returned by COMPOSIO_SEARCH_TOOLS, when available.')

const workflowStepParams = {
  current_step: z
    .string()
    .optional()
    .describe('Short enum-style label for the current workflow step.'),
  current_step_metric: z
    .string()
    .optional()
    .describe('Progress metric such as "3/10 emails" or "0/n messages".'),
}

const composioMetaToolSchemas = {
  COMPOSIO_SEARCH_TOOLS: z
    .object({
      queries: z
        .array(z.unknown())
        .min(1)
        .describe(
          'Structured English search queries. Split independent app/API actions into separate queries.',
        ),
      session: z
        .object({
          generate_id: z.boolean().optional(),
          id: z.string().optional(),
        })
        .catchall(z.unknown())
        .describe(
          'Use { generate_id: true } for a new workflow, or { id } to continue one.',
        ),
      model: z.string().optional().describe('Client LLM model name.'),
    })
    .catchall(z.unknown()),
  COMPOSIO_GET_TOOL_SCHEMAS: z
    .object({
      tool_slugs: z
        .array(z.string())
        .min(1)
        .describe('Composio tool slugs to retrieve schemas for.'),
      include: z
        .array(z.string())
        .optional()
        .describe('Schema fields to include, e.g. input_schema/output_schema.'),
      session_id: sessionIdParam,
    })
    .catchall(z.unknown()),
  COMPOSIO_MANAGE_CONNECTIONS: z
    .object({
      toolkits: z
        .array(z.string())
        .min(1)
        .describe('Toolkit slugs to check or connect, such as gmail/github.'),
      reinitiate_all: z
        .boolean()
        .optional()
        .describe('Force reconnection even if active credentials exist.'),
      session_id: sessionIdParam,
    })
    .catchall(z.unknown()),
  COMPOSIO_MULTI_EXECUTE_TOOL: z
    .object({
      tools: z
        .array(z.record(z.string(), z.unknown()))
        .min(1)
        .describe('Logically independent Composio tools to execute.'),
      thought: z
        .string()
        .optional()
        .describe('One concise sentence explaining the execution intent.'),
      sync_response_to_workbench: z
        .boolean()
        .describe('Use true when the response may be large or reused later.'),
      session_id: sessionIdParam,
      ...workflowStepParams,
    })
    .catchall(z.unknown()),
  COMPOSIO_REMOTE_WORKBENCH: z
    .object({
      code_to_execute: z
        .string()
        .describe('Python code to run in the persistent remote workbench.'),
      thought: z
        .string()
        .optional()
        .describe(
          'One concise sentence describing why the workbench is needed.',
        ),
      session_id: sessionIdParam,
      ...workflowStepParams,
    })
    .catchall(z.unknown()),
  COMPOSIO_REMOTE_BASH_TOOL: z
    .object({
      command: z
        .string()
        .describe('Bash command to run in the remote sandbox.'),
      session_id: sessionIdParam,
    })
    .catchall(z.unknown()),
} satisfies Record<ComposioMetaToolName, z.ZodType>

const composioMetaToolDescriptions = {
  COMPOSIO_SEARCH_TOOLS:
    'Discover relevant Composio tools across external apps. Use this first for requests involving services like Gmail, GitHub, Slack, Linear, Notion, Google Calendar, or Google Sheets.',
  COMPOSIO_GET_TOOL_SCHEMAS:
    'Retrieve complete input schemas for specific Composio tool slugs returned by COMPOSIO_SEARCH_TOOLS.',
  COMPOSIO_MANAGE_CONNECTIONS:
    'Check or initiate user authentication for external app toolkits. Use when search/execution indicates a toolkit is not connected.',
  COMPOSIO_MULTI_EXECUTE_TOOL:
    'Execute one or more discovered Composio app tools in the current workflow session.',
  COMPOSIO_REMOTE_WORKBENCH:
    'Run Python in a persistent Composio workbench for bulk app workflows, large responses, or data transformations.',
  COMPOSIO_REMOTE_BASH_TOOL:
    'Run bash commands in the Composio remote sandbox for simple file and data processing.',
} satisfies Record<ComposioMetaToolName, string>

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

export function getComposioMetaToolDefinitions(params: {
  apiKey: string
}): CustomToolDefinition[] {
  return COMPOSIO_META_TOOL_NAMES.map((toolName) => ({
    toolName,
    inputSchema: composioMetaToolSchemas[toolName],
    description: composioMetaToolDescriptions[toolName],
    endsAgentStep: true,
    exampleInputs: [],
    execute: async (input: unknown) => {
      return executeComposioToolViaServer({
        apiKey: params.apiKey,
        toolName,
        input:
          input && typeof input === 'object'
            ? (input as Record<string, unknown>)
            : { value: toJsonValue(input) },
      })
    },
  }))
}
