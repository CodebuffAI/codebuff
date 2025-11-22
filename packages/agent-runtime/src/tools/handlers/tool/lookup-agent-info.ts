import { removeUndefinedProps } from '@codebuff/common/util/object'
import z from 'zod/v4'

import { getAgentTemplate } from '../../../templates/agent-registry'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type {
  AgentTemplate,
  Logger,
} from '@codebuff/common/types/agent-template'
import type { FetchAgentFromDatabaseFn } from '@codebuff/common/types/contracts/database'

export const handleLookupAgentInfo = ((params: {
  toolCall: CodebuffToolCall<'lookup_agent_info'>
  previousToolCallFinished: Promise<void>

  apiKey: string
  databaseAgentCache: Map<string, AgentTemplate | null>
  localAgentTemplates: Record<string, AgentTemplate>
  logger: Logger
  fetchAgentFromDatabase: FetchAgentFromDatabaseFn
}) => {
  const { toolCall, previousToolCallFinished } = params
  const { agentId } = toolCall.input

  return {
    result: (async () => {
      await previousToolCallFinished

      const agentTemplate = await getAgentTemplate({
        ...params,
        agentId,
      })

      if (!agentTemplate) {
        return [
          {
            type: 'json',
            value: {
              found: false,
              error: `Agent '${agentId}' not found`,
            },
          },
        ]
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

      return [
        {
          type: 'json',
          value: {
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
          },
        },
      ]
    })(),
  }
}) satisfies CodebuffToolHandlerFunction<'lookup_agent_info'>

const toJSONSchema = (schema: z.ZodSchema) => {
  const jsonSchema = z.toJSONSchema(schema, { io: 'input' }) as {
    [key: string]: any
  }
  delete jsonSchema['$schema']
  return jsonSchema
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
