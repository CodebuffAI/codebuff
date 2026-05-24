import { COMPOSIO_META_TOOL_NAMES } from '../../../constants/composio'
import z from 'zod/v4'

import { jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const sessionIdParam = z
  .string()
  .optional()
  .describe('Session ID returned by COMPOSIO_SEARCH_TOOLS, when available.')

const composioMetaToolInputSchemas = {
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
        .default(false)
        .describe('Always use false. Codebuff disables Composio workbench.'),
      session_id: sessionIdParam,
    })
    .catchall(z.unknown()),
}

const composioMetaToolDescriptions = {
  COMPOSIO_SEARCH_TOOLS:
    'Discover relevant Composio tools across external apps. Use this first for requests involving services like Gmail, GitHub, Slack, Linear, Notion, Google Calendar, or Google Sheets.',
  COMPOSIO_GET_TOOL_SCHEMAS:
    'Retrieve complete input schemas for specific Composio tool slugs returned by COMPOSIO_SEARCH_TOOLS.',
  COMPOSIO_MANAGE_CONNECTIONS:
    'Check or initiate user authentication for external app toolkits. Use when search/execution indicates a toolkit is not connected.',
  COMPOSIO_MULTI_EXECUTE_TOOL:
    'Execute one or more discovered Composio app tools in the current workflow session. Do not use workbench offloading.',
}

const composioOutputSchema = jsonToolResultSchema(
  z.union([
    z.json(),
    z.object({
      errorMessage: z.string(),
      status: z.number().optional(),
    }),
  ]),
)

export const composioMetaToolParams = {
  COMPOSIO_MANAGE_CONNECTIONS: {
    toolName: 'COMPOSIO_MANAGE_CONNECTIONS',
    endsAgentStep: true,
    description: composioMetaToolDescriptions.COMPOSIO_MANAGE_CONNECTIONS,
    inputSchema: composioMetaToolInputSchemas.COMPOSIO_MANAGE_CONNECTIONS,
    outputSchema: composioOutputSchema,
  },
  COMPOSIO_MULTI_EXECUTE_TOOL: {
    toolName: 'COMPOSIO_MULTI_EXECUTE_TOOL',
    endsAgentStep: true,
    description: composioMetaToolDescriptions.COMPOSIO_MULTI_EXECUTE_TOOL,
    inputSchema: composioMetaToolInputSchemas.COMPOSIO_MULTI_EXECUTE_TOOL,
    outputSchema: composioOutputSchema,
  },
  COMPOSIO_SEARCH_TOOLS: {
    toolName: 'COMPOSIO_SEARCH_TOOLS',
    endsAgentStep: true,
    description: composioMetaToolDescriptions.COMPOSIO_SEARCH_TOOLS,
    inputSchema: composioMetaToolInputSchemas.COMPOSIO_SEARCH_TOOLS,
    outputSchema: composioOutputSchema,
  },
  COMPOSIO_GET_TOOL_SCHEMAS: {
    toolName: 'COMPOSIO_GET_TOOL_SCHEMAS',
    endsAgentStep: true,
    description: composioMetaToolDescriptions.COMPOSIO_GET_TOOL_SCHEMAS,
    inputSchema: composioMetaToolInputSchemas.COMPOSIO_GET_TOOL_SCHEMAS,
    outputSchema: composioOutputSchema,
  },
} satisfies {
  [K in (typeof COMPOSIO_META_TOOL_NAMES)[number]]: $ToolParams<K>
}
