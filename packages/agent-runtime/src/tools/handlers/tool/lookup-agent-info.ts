import { getAgentTemplate } from '../../../templates/agent-registry'
import { removeUndefinedProps } from '@codebuff/common/util/object'
import z from 'zod/v4'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'

export const handleLookupAgentInfo: CodebuffToolHandlerFunction<
  'lookup_agent_info'
> = (params) => {
  const { agentId } = params.toolCall.input

  return {
    result: (async () => {
      const agentTemplate = await getAgentTemplate({
        ...params,
        agentId,
        localAgentTemplates: params.state.localAgentTemplates || {},
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
}

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
