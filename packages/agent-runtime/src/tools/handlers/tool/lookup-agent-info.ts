import { jsonToolResult } from '@codebirds/common/util/messages'
import { removeUndefinedProps } from '@codebirds/common/util/object'
import z from 'zod/v4'

import { getAgentTemplate } from '../../../templates/agent-registry'

import type { CodebirdsToolHandlerFunction } from '../handler-function-type'
import type {
  CodebirdsToolCall,
  CodebirdsToolOutput,
} from '@codebirds/common/tools/list'
import type {
  AgentTemplate,
  Logger,
} from '@codebirds/common/types/agent-template'
import type { FetchAgentFromDatabaseFn } from '@codebirds/common/types/contracts/database'

export const handleLookupAgentInfo = (async (params: {
  toolCall: CodebirdsToolCall<'lookup_agent_info'>
  previousToolCallFinished: Promise<void>

  apiKey: string
  databaseAgentCache: Map<string, AgentTemplate | null>
  localAgentTemplates: Record<string, AgentTemplate>
  logger: Logger
  fetchAgentFromDatabase: FetchAgentFromDatabaseFn
}): Promise<{ output: CodebirdsToolOutput<'lookup_agent_info'> }> => {
  const { toolCall, previousToolCallFinished } = params
  const { agentId } = toolCall.input

  await previousToolCallFinished

  const agentTemplate = await getAgentTemplate({
    ...params,
    agentId,
  })

  if (!agentTemplate) {
    return {
      output: jsonToolResult({
        found: false,
        error: `Agent '${agentId}' not found`,
      }),
    }
  }
  const {
    id,
    displayName,
    model,
    includeMessageHistory,
    inputSchema,
    spawnerPrompt,
    outputMode,
    outputSchema,
    toolNames,
    spawnableAgents,
  } = agentTemplate

  return {
    output: jsonToolResult({
      found: true,
      agent: {
        ...removeUndefinedProps({
          fullAgentId: agentId,
          id,
          displayName,
          model,
          toolNames,
          spawnableAgents,
          includeMessageHistory,
          spawnerPrompt,
          ...(inputSchema && {
            inputSchema: inputSchemaToJSONSchema(inputSchema),
          }),
          outputMode,
          ...(outputSchema && {
            outputSchema: toJSONSchema(outputSchema),
          }),
        }),
      },
    }),
  }
}) satisfies CodebirdsToolHandlerFunction<'lookup_agent_info'>

const toJSONSchema = (schema: z.ZodSchema) => {
  try {
    const jsonSchema = z.toJSONSchema(schema, { io: 'input' }) as {
      [key: string]: any
    }
    delete jsonSchema['$schema']
    return jsonSchema
  } catch {
    return { type: 'object', description: 'Schema unavailable' }
  }
}

const inputSchemaToJSONSchema = (inputSchema: {
  prompt?: z.ZodSchema
  params?: z.ZodSchema
}) => {
  return removeUndefinedProps({
    prompt: inputSchema.prompt ? toJSONSchema(inputSchema.prompt) : undefined,
    params: inputSchema.params ? toJSONSchema(inputSchema.params) : undefined,
  })
}
