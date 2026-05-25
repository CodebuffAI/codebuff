import { COMPOSIO_META_TOOL_NAMES } from '../../../constants/composio'
import z from 'zod/v4'

import { jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const sessionIdParam = z
  .string()
  .optional()
  .describe('Session ID returned by composio_search_tools, when available.')

const composioMetaToolInputSchemas = {
  composio_search_tools: z
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
  composio_get_tool_schemas: z
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
  composio_manage_connections: z
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
  composio_multi_execute_tool: z
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
  composio_search_tools:
    'Discover relevant Composio tools across external apps. Use this first for requests involving services like Gmail, GitHub, Slack, Linear, Notion, Google Calendar, or Google Sheets.',
  composio_get_tool_schemas:
    'Retrieve complete input schemas for specific Composio tool slugs returned by composio_search_tools.',
  composio_manage_connections:
    'Check or initiate user authentication for external app toolkits. Use when search/execution indicates a toolkit is not connected.',
  composio_multi_execute_tool:
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
  composio_manage_connections: {
    toolName: 'composio_manage_connections',
    endsAgentStep: true,
    description: composioMetaToolDescriptions.composio_manage_connections,
    inputSchema: composioMetaToolInputSchemas.composio_manage_connections,
    outputSchema: composioOutputSchema,
  },
  composio_multi_execute_tool: {
    toolName: 'composio_multi_execute_tool',
    endsAgentStep: true,
    description: composioMetaToolDescriptions.composio_multi_execute_tool,
    inputSchema: composioMetaToolInputSchemas.composio_multi_execute_tool,
    outputSchema: composioOutputSchema,
  },
  composio_search_tools: {
    toolName: 'composio_search_tools',
    endsAgentStep: true,
    description: composioMetaToolDescriptions.composio_search_tools,
    inputSchema: composioMetaToolInputSchemas.composio_search_tools,
    outputSchema: composioOutputSchema,
  },
  composio_get_tool_schemas: {
    toolName: 'composio_get_tool_schemas',
    endsAgentStep: true,
    description: composioMetaToolDescriptions.composio_get_tool_schemas,
    inputSchema: composioMetaToolInputSchemas.composio_get_tool_schemas,
    outputSchema: composioOutputSchema,
  },
} satisfies {
  [K in (typeof COMPOSIO_META_TOOL_NAMES)[number]]: $ToolParams<K>
}
