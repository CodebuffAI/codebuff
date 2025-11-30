import { getAgentTemplate } from './agent-registry'
import { buildArray } from '@codebuff/common/util/array'
import { schemaToJsonStr } from '@codebuff/common/util/zod-schema'
import { z } from 'zod/v4'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { AgentTemplateType } from '@codebuff/common/types/session-state'
import type { ToolSet } from 'ai'

/**
 * Gets the short agent name from a fully qualified agent ID.
 * E.g., 'codebuff/file-picker@1.0.0' -> 'file-picker'
 */
export function getAgentShortName(agentType: AgentTemplateType): string {
  const withoutVersion = agentType.split('@')[0]
  const parts = withoutVersion.split('/')
  return parts[parts.length - 1]
}

/**
 * Builds a flat input schema for an agent tool by combining prompt and params.
 * E.g., { prompt?: string, ...paramsFields }
 */
export function buildAgentFlatInputSchema(
  agentTemplate: AgentTemplate,
): z.ZodType {
  const { inputSchema } = agentTemplate

  // Start with an empty object schema
  let schemaFields: Record<string, z.ZodType> = {}

  // Add prompt field if defined
  if (inputSchema?.prompt) {
    schemaFields.prompt = inputSchema.prompt.optional()
  }

  // Merge params fields directly into the schema (flat structure)
  if (inputSchema?.params) {
    // Try to get the shape from the params schema directly if it's a ZodObject
    // This preserves the full nested structure instead of converting to z.any()
    const paramsShape = getZodObjectShape(inputSchema.params)

    if (paramsShape) {
      // We have the original Zod shape, use it directly
      for (const [key, fieldSchema] of Object.entries(paramsShape)) {
        // Skip if we already have a prompt field
        if (key === 'prompt') continue
        schemaFields[key] = fieldSchema as z.ZodType
      }
    }
  }

  return z
    .object(schemaFields)
    .describe(
      agentTemplate.spawnerPrompt ||
        `Spawn the ${agentTemplate.displayName} agent`,
    )
}

/**
 * Extracts the shape from a Zod schema if it's a ZodObject.
 * Handles wrapped types like ZodOptional, ZodNullable, ZodDefault, etc.
 */
function getZodObjectShape(
  schema: z.ZodType,
): Record<string, z.ZodType> | null {
  // ZodObject has a public .shape property in Zod v4
  if (
    'shape' in schema &&
    typeof schema.shape === 'object' &&
    schema.shape !== null
  ) {
    return schema.shape as Record<string, z.ZodType>
  }

  // Handle wrapped types (optional, nullable, default, etc.) via internal def
  const def = (schema as any)?._zod?.def
  if (def?.inner) {
    return getZodObjectShape(def.inner)
  }

  return null
}

/**
 * Builds AI SDK tool definitions for spawnable agents.
 * These tools allow the model to call agents directly as tool calls.
 */
export async function buildAgentToolSet(
  params: {
    spawnableAgents: AgentTemplateType[]
    agentTemplates: Record<string, AgentTemplate>
    logger: Logger
  } & ParamsExcluding<
    typeof getAgentTemplate,
    'agentId' | 'localAgentTemplates'
  >,
): Promise<ToolSet> {
  const { spawnableAgents, agentTemplates } = params

  const toolSet: ToolSet = {}

  for (const agentType of spawnableAgents) {
    const agentTemplate = await getAgentTemplate({
      ...params,
      agentId: agentType,
      localAgentTemplates: agentTemplates,
    })

    if (!agentTemplate) continue

    const shortName = getAgentShortName(agentType)
    const inputSchema = buildAgentFlatInputSchema(agentTemplate)

    // Use the same structure as other tools in toolParams
    toolSet[shortName] = {
      description:
        agentTemplate.spawnerPrompt ||
        `Spawn the ${agentTemplate.displayName} agent`,
      inputSchema,
    }
  }

  return toolSet
}

/**
 * Builds the description of a single agent for the system prompt.
 */
function buildSingleAgentDescription(
  agentType: AgentTemplateType,
  agentTemplate: AgentTemplate | null,
): string {
  if (!agentTemplate) {
    // Fallback for unknown agents
    return `- ${agentType}: Dynamic agent (description not available)
prompt: {"description": "A coding task to complete", "type": "string"}
params: None`
  }

  const { inputSchema } = agentTemplate
  const inputSchemaStr = inputSchema
    ? [
        `prompt: ${schemaToJsonStr(inputSchema.prompt)}`,
        `params: ${schemaToJsonStr(inputSchema.params)}`,
      ].join('\n')
    : ['prompt: None', 'params: None'].join('\n')

  return buildArray(
    `- ${agentType}: ${agentTemplate.spawnerPrompt}`,
    agentTemplate.includeMessageHistory &&
      'This agent can see the current message history.',
    agentTemplate.inheritParentSystemPrompt &&
      "This agent inherits the parent's system prompt for prompt caching.",
    inputSchemaStr,
  ).join('\n')
}

/**
 * Builds the full spawnable agents specification for subagent instructions.
 * This is used when inheritSystemPrompt is true to tell subagents which agents they can spawn.
 */
export async function buildFullSpawnableAgentsSpec(
  params: {
    spawnableAgents: AgentTemplateType[]
    agentTemplates: Record<string, AgentTemplate>
    logger: Logger
  } & ParamsExcluding<
    typeof getAgentTemplate,
    'agentId' | 'localAgentTemplates'
  >,
): Promise<string> {
  const { spawnableAgents, agentTemplates } = params
  if (spawnableAgents.length === 0) {
    return ''
  }

  const subAgentTypesAndTemplates = await Promise.all(
    spawnableAgents.map(async (agentType) => {
      return [
        agentType,
        await getAgentTemplate({
          ...params,
          agentId: agentType,
          localAgentTemplates: agentTemplates,
        }),
      ] as const
    }),
  )

  const agentsDescription = subAgentTypesAndTemplates
    .map(([agentType, agentTemplate]) =>
      buildSingleAgentDescription(agentType, agentTemplate),
    )
    .filter(Boolean)
    .join('\n\n')

  return `You are a subagent that can only spawn the following agents using the spawn_agents tool:

${agentsDescription}`
}
