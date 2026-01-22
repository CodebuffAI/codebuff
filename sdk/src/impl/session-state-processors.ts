/**
 * Session state processing utilities for agent and tool definitions.
 */

import z from 'zod/v4'

import type { CustomToolDefinition } from '../custom-tool'
import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { CustomToolDefinitions } from '@codebuff/common/util/file'

/**
 * Processes agent definitions array and converts handleSteps functions to strings
 */
export function processAgentDefinitions(
  agentDefinitions: AgentDefinition[],
  logger?: Logger,
): Record<string, unknown> {
  const processedAgentTemplates: Record<string, unknown> = {}
  for (const definition of agentDefinitions) {
    const processedConfig = { ...definition } as Record<string, unknown>
    if (
      processedConfig.handleSteps &&
      typeof processedConfig.handleSteps === 'function'
    ) {
      processedConfig.handleSteps = processedConfig.handleSteps.toString()
    }
    if (processedConfig.id) {
      processedAgentTemplates[processedConfig.id as string] = processedConfig
    } else {
      logger?.warn?.(
        { definition: { ...definition, handleSteps: undefined } },
        'Skipping agent definition without id',
      )
    }
  }
  return processedAgentTemplates
}

/**
 * Processes custom tool definitions into the format expected by SessionState.
 * Converts Zod schemas to JSON Schema format so they can survive JSON serialization.
 */
export function processCustomToolDefinitions(
  customToolDefinitions: CustomToolDefinition[],
): CustomToolDefinitions {
  return Object.fromEntries(
    customToolDefinitions.map((toolDefinition) => {
      const jsonSchema = z.toJSONSchema(toolDefinition.inputSchema, {
        io: 'input',
      }) as Record<string, unknown>
      delete jsonSchema['$schema']

      return [
        toolDefinition.toolName,
        {
          inputSchema: jsonSchema,
          description: toolDefinition.description,
          endsAgentStep: toolDefinition.endsAgentStep,
          exampleInputs: toolDefinition.exampleInputs,
        },
      ]
    }),
  )
}
