import { convertJsonSchemaToZod } from 'zod-from-json-schema'

import {
  formatParentInstructionsError,
  formatSubagentError,
  validateParentInstructions,
  validateSubagents,
} from '../util/agent-template-validation'

import { normalizeAgentNames } from '../util/agent-name-normalization'
import { logger } from '../util/logger'

import type { ToolName } from '../tools/constants'
import type { AgentTemplate } from '../types/agent-template'
import type { DynamicAgentTemplate } from '../types/dynamic-agent-template'
import type { AgentTemplateType } from '../types/session-state'

export interface DynamicAgentValidationError {
  filePath: string
  message: string
}

/**
 * Collect all agent IDs from template files without full validation
 */
export function collectAgentIds(
  agentTemplates: Record<string, DynamicAgentTemplate> = {},
): string[] {
  const agentIds: string[] = []
  const jsonFiles = Object.keys(agentTemplates)

  for (const filePath of jsonFiles) {
    try {
      const content = agentTemplates[filePath]
      if (!content) {
        continue
      }

      // Extract the agent ID if it exists
      if (content.id && typeof content.id === 'string') {
        agentIds.push(content.id)
      }
    } catch (error) {
      // Log but don't fail the collection process for other errors
      logger.debug(
        { filePath, error },
        'Failed to extract agent ID during collection phase',
      )
    }
  }

  return agentIds
}

/**
 * Validate and load dynamic agent templates from user-provided agentTemplates
 */
export function validateAgents(
  agentTemplates: Record<string, DynamicAgentTemplate> = {},
): {
  templates: Record<string, AgentTemplate>
  validationErrors: DynamicAgentValidationError[]
} {
  const templates: Record<string, AgentTemplate> = {}
  const validationErrors: DynamicAgentValidationError[] = []

  const hasAgentTemplates = Object.keys(agentTemplates).length > 0

  if (!hasAgentTemplates) {
    return {
      templates,
      validationErrors,
    }
  }

  const agentKeys = Object.keys(agentTemplates)

  // Pass 1: Collect all agent IDs from template files
  const dynamicAgentIds = collectAgentIds(agentTemplates)

  // Pass 2: Load and validate each agent template
  for (const agentKey of agentKeys) {
    try {
      const content = agentTemplates[agentKey]
      if (!content) {
        continue
      }

      const validationResult = validateSingleAgent(content, {
        filePath: agentKey,
        dynamicAgentIds,
      })

      if (!validationResult.success) {
        validationErrors.push({
          filePath: agentKey,
          message: validationResult.error!,
        })
        continue
      }

      if (templates[content.id]) {
        validationErrors.push({
          filePath: agentKey,
          message: `Duplicate agent ID: ${content.id}`,
        })
        continue
      }
      templates[content.id] = validationResult.agentTemplate!
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'

      validationErrors.push({
        filePath: agentKey,
        message: `Error in agent template ${agentKey}: ${errorMessage}`,
      })

      logger.warn(
        { filePath: agentKey, error: errorMessage },
        'Failed to load dynamic agent template',
      )
    }
  }

  return {
    templates,
    validationErrors,
  }
}

/**
 * Validates a single dynamic agent template and converts it to an AgentTemplate.
 * This is a plain function equivalent to the core logic of loadSingleAgent.
 *
 * @param dynamicAgentIds - Array of all available dynamic agent IDs for validation
 * @param template - The dynamic agent template to validate
 * @param options - Optional configuration object
 * @param options.filePath - Optional file path for error context
 * @param options.skipSubagentValidation - Skip subagent validation when loading from database
 * @returns Validation result with either the converted AgentTemplate or an error
 */
export function validateSingleAgent(
  template: DynamicAgentTemplate,
  options?: {
    dynamicAgentIds?: string[]
    filePath?: string
    skipSubagentValidation?: boolean
  },
): {
  success: boolean
  agentTemplate?: AgentTemplate
  error?: string
} {
  const {
    filePath,
    skipSubagentValidation = false,
    dynamicAgentIds = [],
  } = options || {}

  try {
    // Validate subagents (skip if requested, e.g., for database agents)
    if (!skipSubagentValidation) {
      const subagentValidation = validateSubagents(
        template.subagents,
        dynamicAgentIds,
      )
      if (!subagentValidation.valid) {
        return {
          success: false,
          error: formatSubagentError(
            subagentValidation.invalidAgents,
            subagentValidation.availableAgents,
          ),
        }
      }
    }

    // Validate parent instructions if they exist
    if (template.parentInstructions) {
      const parentInstructionsValidation = validateParentInstructions(
        template.parentInstructions,
        dynamicAgentIds,
      )
      if (!parentInstructionsValidation.valid) {
        return {
          success: false,
          error: formatParentInstructionsError(
            parentInstructionsValidation.invalidAgents,
            parentInstructionsValidation.availableAgents,
          ),
        }
      }
    }

    const validatedSubagents = normalizeAgentNames(
      template.subagents,
    ) as AgentTemplateType[]

    // Convert schemas and handle validation errors
    let inputSchema: AgentTemplate['inputSchema']
    try {
      inputSchema = convertInputSchema(
        template.inputSchema?.prompt,
        template.inputSchema?.params,
        filePath,
      )
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Schema conversion failed',
      }
    }

    // Convert outputSchema if present
    let outputSchema: AgentTemplate['outputSchema']
    if (template.outputSchema) {
      try {
        outputSchema = convertJsonSchemaToZod(template.outputSchema)
      } catch (error) {
        return {
          success: false,
          error: `Failed to convert outputSchema to Zod: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }
      }
    }

    // Validate handleSteps if present
    if (template.handleSteps) {
      if (!isValidGeneratorFunction(template.handleSteps)) {
        return {
          success: false,
          error: `handleSteps must be a generator function: "function* (params) { ... }". Found: ${template.handleSteps.substring(0, 50)}...`,
        }
      }
    }

    // Convert to internal AgentTemplate format
    const agentTemplate: AgentTemplate = {
      ...template,
      outputSchema,
      inputSchema,
      toolNames: template.toolNames as ToolName[],
      subagents: validatedSubagents,
    }

    return {
      success: true,
      agentTemplate,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'

    return {
      success: false,
      error: `Error validating agent template: ${errorMessage}`,
    }
  }
}

/**
 * Validates if a string represents a valid generator function
 */
function isValidGeneratorFunction(code: string): boolean {
  const trimmed = code.trim()
  // Check if it's a generator function (must start with function*)
  return trimmed.startsWith('function*')
}

/**
 * Convert JSON schema to Zod schema format using json-schema-to-zod.
 * This is done once during loading to avoid repeated conversions.
 * Throws descriptive errors for validation failures.
 */
function convertInputSchema(
  inputPromptSchema?: Record<string, any>,
  paramsSchema?: Record<string, any>,
  filePath?: string,
): AgentTemplate['inputSchema'] {
  const result: any = {}
  const fileContext = filePath ? ` in ${filePath}` : ''

  // Handle prompt schema
  if (inputPromptSchema) {
    try {
      if (
        typeof inputPromptSchema !== 'object' ||
        Object.keys(inputPromptSchema).length === 0
      ) {
        throw new Error(
          `Invalid inputSchema.prompt${fileContext}: Schema must be a valid non-empty JSON schema object. Found: ${typeof inputPromptSchema}`,
        )
      }
      const promptZodSchema = convertJsonSchemaToZod(inputPromptSchema)
      // Validate that the schema results in string or undefined
      const testResult = promptZodSchema.safeParse('test')
      const testUndefined = promptZodSchema.safeParse(undefined)

      if (!testResult.success && !testUndefined.success) {
        const errorDetails =
          testResult.error?.issues?.[0]?.message || 'validation failed'
        throw new Error(
          `Invalid inputSchema.prompt${fileContext}: Schema must allow string or undefined values. ` +
            `Current schema validation error: ${errorDetails}. ` +
            `Please ensure your JSON schema accepts string types.`,
        )
      }

      result.prompt = promptZodSchema
    } catch (error) {
      if (error instanceof Error && error.message.includes('inputSchema')) {
        // Re-throw our custom validation errors
        throw error
      }

      // Handle json-schema-to-zod conversion errors
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      throw new Error(
        `Failed to convert inputSchema.prompt to Zod${fileContext}: ${errorMessage}. ` +
          `Please check that your inputSchema.prompt is a valid non-empty JSON schema object.`,
      )
    }
  }

  // Handle params schema
  if (paramsSchema) {
    try {
      if (
        typeof paramsSchema !== 'object' ||
        Object.keys(paramsSchema).length === 0
      ) {
        throw new Error(
          `Invalid inputSchema.params${fileContext}: Schema must be a valid non-empty JSON schema object. Found: ${typeof paramsSchema}`,
        )
      }
      const paramsZodSchema = convertJsonSchemaToZod(paramsSchema)
      result.params = paramsZodSchema
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      throw new Error(
        `Failed to convert inputSchema.params to Zod${fileContext}: ${errorMessage}. ` +
          `Please check that your inputSchema.params is a valid non-empty JSON schema object.`,
      )
    }
  }

  return result
}
