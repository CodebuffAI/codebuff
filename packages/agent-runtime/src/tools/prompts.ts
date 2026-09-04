import { endsAgentStepParam } from '@codebuff/common/tools/constants'
import { toolParams } from '@codebuff/common/tools/list'
import { codeSearchDisplayVariants } from '@codebuff/common/tools/params/tool/code-search'
import { readFilesDisplayVariants } from '@codebuff/common/tools/params/tool/read-files'
import { runTerminalCommandNoAttributionDescription } from '@codebuff/common/tools/params/tool/run-terminal-command'
import { AVAILABLE_SKILLS_PLACEHOLDER } from '@codebuff/common/tools/params/tool/skill'
import { getToolCallString } from '@codebuff/common/tools/utils'
import { buildArray } from '@codebuff/common/util/array'
import { formatAvailableSkillsXml } from '@codebuff/common/util/skills'
import { pluralize } from '@codebuff/common/util/string'
import { cloneDeep } from 'lodash'
import z from 'zod/v4'
import { convertJsonSchemaToZod } from 'zod-from-json-schema'

import type { ToolName } from '@codebuff/common/tools/constants'
import type { SkillsMap } from '@codebuff/common/types/skill'
import type { CustomToolDefinitions } from '@codebuff/common/util/file'
import type { ToolSet } from 'ai'

/**
 * Ensures the inputSchema is a Zod schema. If it's a JSON Schema object
 * (from SDK custom tools that were serialized), converts it to Zod.
 */
export function ensureZodSchema(
  schema: z.ZodType | Record<string, unknown>,
): z.ZodType {
  // Check if it's already a Zod schema by looking for the safeParse method
  if (
    schema &&
    typeof (schema as { safeParse?: unknown }).safeParse === 'function'
  ) {
    return schema as z.ZodType
  }
  // JSON Schema object - convert to Zod
  return convertJsonSchemaToZod(schema as Record<string, unknown>)
}

function ensureJsonSchemaCompatible(schema: z.ZodType): z.ZodType {
  try {
    z.toJSONSchema(schema, { io: 'input' })
    return schema
  } catch {
    const fallback = z.object({}).passthrough()
    return schema.description ? fallback.describe(schema.description) : fallback
  }
}

function toJsonSchemaSafe(schema: z.ZodType): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>
  } catch {
    return { type: 'object', properties: {} }
  }
}

function hasMeaningfulJsonSchema(jsonSchema: Record<string, unknown>): boolean {
  const properties = jsonSchema.properties
  if (properties && typeof properties === 'object' && Object.keys(properties).length > 0) {
    return true
  }

  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    const value = jsonSchema[key]
    if (Array.isArray(value) && value.length > 0) {
      return true
    }
  }

  const required = jsonSchema.required
  if (Array.isArray(required) && required.length > 0) {
    return true
  }

  return false
}

function paramsSection(params: { schema: z.ZodType; endsAgentStep: boolean }) {
  const { schema, endsAgentStep } = params
  const safeSchema = ensureJsonSchemaCompatible(schema)
  const schemaWithEndsAgentStepParam = endsAgentStep
    ? safeSchema.and(
      z.object({
        [endsAgentStepParam]: z
          .literal(endsAgentStep)
          .describe('Easp flag must be set to true'),
      }),
    )
    : safeSchema
  const jsonSchema = toJsonSchemaSafe(schemaWithEndsAgentStepParam)
  delete jsonSchema.description
  delete jsonSchema['$schema']
  const paramsDescription = hasMeaningfulJsonSchema(jsonSchema)
    ? JSON.stringify(jsonSchema, null, 2)
    : 'None'

  let paramsSection = ''
  if (paramsDescription.length === 1 && paramsDescription[0] === 'None') {
    paramsSection = 'Params: None'
  } else if (paramsDescription.length > 0) {
    paramsSection = `Params: ${paramsDescription}`
  }
  return paramsSection
}

// Helper function to build the full tool description markdown
export function buildToolDescription(params: {
  toolName: string
  schema: z.ZodType
  description?: string
  endsAgentStep: boolean
  exampleInputs?: any[]
}): string {
  const {
    toolName,
    schema,
    description = '',
    endsAgentStep,
    exampleInputs = [],
  } = params
  const descriptionWithExamples = buildArray(
    description,
    exampleInputs.length > 0
      ? `${pluralize(exampleInputs.length, 'Example')}:`
      : '',
    ...exampleInputs.map((example) =>
      getToolCallString(toolName, example, endsAgentStep),
    ),
  ).join('\n\n')
  return buildArray([
    `### ${toolName}`,
    schema.description || '',
    paramsSection({ schema, endsAgentStep }),
    descriptionWithExamples,
  ]).join('\n\n')
}

export const toolDescriptions = Object.fromEntries(
  Object.entries(toolParams).map(([name, config]) => [
    name,
    buildToolDescription({
      toolName: name,
      schema: config.inputSchema,
      description: config.description,
      endsAgentStep: config.endsAgentStep,
    }),
  ]),
) as Record<keyof typeof toolParams, string>

const readStyleDisplayVariants: Partial<
  Record<ToolName, { legacy: DisplayVariant; windowed: DisplayVariant }>
> = {
  read_files: readFilesDisplayVariants,
  code_search: codeSearchDisplayVariants,
}

type DisplayVariant = { description: string; inputSchema: z.ZodType }

export async function getToolSet(params: {
  toolNames: string[]
  windowedFileReads: boolean
  /**
   * Serve the `run_terminal_command` description that teaches NO commit
   * trailer. Off by default, so an ordinary run is byte-identical.
   */
  suppressCommitAttribution?: boolean
  additionalToolDefinitions: () => Promise<CustomToolDefinitions>
  agentTools: ToolSet
  skills: SkillsMap
}): Promise<ToolSet> {
  const {
    toolNames,
    windowedFileReads,
    suppressCommitAttribution,
    additionalToolDefinitions,
    agentTools,
    skills,
  } = params

  // Generate available skills XML for the skill tool description
  const availableSkillsXml = formatAvailableSkillsXml(skills)
  const toolSet: ToolSet = {}
  for (const toolName of toolNames) {
    if (toolName in toolParams) {
      const baseToolDef = toolParams[toolName as ToolName]
      const displayVariants = readStyleDisplayVariants[toolName as ToolName]
      const toolDef = displayVariants
        ? {
            ...baseToolDef,
            ...(windowedFileReads
              ? displayVariants.windowed
              : displayVariants.legacy),
          }
        : toolName === 'run_terminal_command' && suppressCommitAttribution
          ? {
              ...baseToolDef,
              description: runTerminalCommandNoAttributionDescription,
            }
          : baseToolDef

      // For the skill tool, replace the placeholder with actual available skills
      if (toolName === 'skill' && availableSkillsXml) {
        let description = toolDef.description ?? ''
        description = description.replace(
          AVAILABLE_SKILLS_PLACEHOLDER,
          availableSkillsXml,
        )
        toolSet[toolName] = {
          ...toolDef,
          description,
        }
      } else if (toolName === 'skill') {
        // Explicitly state no skills are available
        let description = toolDef.description ?? ''
        description = description.replace(
          AVAILABLE_SKILLS_PLACEHOLDER,
          'There are no skills available. Do not use this tool because there are no skills to load.',
        )
        toolSet[toolName] = {
          ...toolDef,
          description,
        }
      } else {
        toolSet[toolName] = toolDef
      }
    }
  }

  const toolDefinitions = await additionalToolDefinitions()
  for (const [toolName, toolDefinition] of Object.entries(toolDefinitions)) {
    const clonedDef = cloneDeep(toolDefinition)
    // Custom tool inputSchema may be JSON Schema (from SDK) or Zod (from MCP)
    // Ensure it's a Zod schema for the AI SDK
    const zodSchema = ensureZodSchema(clonedDef.inputSchema)
    const safeSchema = ensureJsonSchemaCompatible(zodSchema)
    toolSet[toolName] = {
      ...clonedDef,
      inputSchema: safeSchema,
    } as (typeof toolSet)[string]
  }

  // Add agent tools (agents as direct tool calls)
  for (const [toolName, toolDefinition] of Object.entries(agentTools)) {
    toolSet[toolName] = toolDefinition
  }

  return toolSet
}
