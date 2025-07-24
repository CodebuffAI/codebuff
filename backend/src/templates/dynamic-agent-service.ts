import * as path from 'path'

import { DynamicAgentTemplate } from '@codebuff/common/types/dynamic-agent-template'
import { AgentTemplateType } from '@codebuff/common/types/session-state'
import { normalizeAgentNames } from '@codebuff/common/util/agent-name-normalization'
import {
  formatParentInstructionsError,
  formatSpawnableAgentError,
  validateParentInstructions,
  validateSpawnableAgents,
} from '@codebuff/common/util/agent-template-validation'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { convertJsonSchemaToZod } from 'zod-from-json-schema'

import { ToolName } from '@codebuff/common/constants/tools'
import { logger } from '../util/logger'
import { AgentTemplate } from './types'

export interface DynamicAgentValidationError {
  filePath: string
  message: string
  details?: string
}

export interface DynamicAgentLoadResult {
  templates: Record<string, AgentTemplate>
  validationErrors: DynamicAgentValidationError[]
}

/**
 * Centralized service for managing dynamic agent templates.
 * Handles loading, validation, and schema conversion for dynamic agents.
 */
export class DynamicAgentService {
  private templates: Record<string, AgentTemplate> = {}
  private validationErrors: DynamicAgentValidationError[] = []
  private isLoaded = false

  /**
   * Load and validate dynamic agent templates from user-provided agentTemplates
   */
  async loadAgents(
    fileContext: ProjectFileContext
  ): Promise<DynamicAgentLoadResult> {
    this.templates = {}
    this.validationErrors = []

    // Check if we have agentTemplates in fileContext
    const agentTemplates = fileContext.agentTemplates || {}
    const hasAgentTemplates = Object.keys(agentTemplates).length > 0

    if (!hasAgentTemplates) {
      this.isLoaded = true
      return {
        templates: this.templates,
        validationErrors: this.validationErrors,
      }
    }
    try {
      const agentKeys = Object.keys(agentTemplates)

      // Pass 1: Collect all agent IDs from template files
      const dynamicAgentIds = await this.collectAgentIds(
        agentKeys,
        agentTemplates
      )

      // Pass 2: Load and validate each agent template
      for (const agentKey of agentKeys) {
        await this.loadSingleAgent(
          agentKey,
          dynamicAgentIds,
          fileContext,
          agentTemplates
        )
      }
    } catch (error) {
      // Re-throw override errors to surface them properly
      if (error instanceof Error && error.message.includes('override: true')) {
        this.validationErrors.push({
          filePath: 'agentTemplates',
          message: error.message,
          details: error.message,
        })
      } else {
        logger.error({ error }, 'Failed to process agent templates')
        this.validationErrors.push({
          filePath: 'agentTemplates',
          message: 'Failed to process agent templates',
          details: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    this.isLoaded = true

    return {
      templates: this.templates,
      validationErrors: this.validationErrors,
    }
  }

  /**
   * First pass: Collect all agent IDs from template files without full validation
   */
  private async collectAgentIds(
    jsonFiles: string[],
    agentTemplates: Record<string, DynamicAgentTemplate> = {}
  ): Promise<string[]> {
    const agentIds: string[] = []

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
        // Re-throw override errors
        if (
          error instanceof Error &&
          error.message.includes('override: true')
        ) {
          throw error
        }
        // Log but don't fail the collection process for other errors
        logger.debug(
          { filePath, error },
          'Failed to extract agent ID during collection phase'
        )
      }
    }

    return agentIds
  }

  /**
   * Load and validate a single agent template file
   */
  private async loadSingleAgent(
    filePath: string,
    dynamicAgentIds: string[],
    fileContext: ProjectFileContext,
    agentTemplates: Record<string, DynamicAgentTemplate> = {}
  ): Promise<void> {
    const fileDir = path.join(fileContext.projectRoot, path.dirname(filePath))

    try {
      const content = agentTemplates[filePath]
      if (!content) {
        return
      }

      const spawnableValidation = validateSpawnableAgents(
        content.spawnableAgents,
        dynamicAgentIds
      )
      if (!spawnableValidation.valid) {
        this.validationErrors.push({
          filePath,
          message: formatSpawnableAgentError(
            spawnableValidation.invalidAgents,
            spawnableValidation.availableAgents
          ),
          details: `Available agents: ${spawnableValidation.availableAgents.join(', ')}`,
        })
        return
      }

      // Validate parent instructions if they exist
      if (content.parentInstructions) {
        const parentInstructionsValidation = validateParentInstructions(
          content.parentInstructions,
          dynamicAgentIds
        )
        if (!parentInstructionsValidation.valid) {
          this.validationErrors.push({
            filePath,
            message: formatParentInstructionsError(
              parentInstructionsValidation.invalidAgents,
              parentInstructionsValidation.availableAgents
            ),
            details: `Available agents: ${parentInstructionsValidation.availableAgents.join(', ')}`,
          })
          return
        }
      }

      const validatedSpawnableAgents = normalizeAgentNames(
        content.spawnableAgents
      ) as AgentTemplateType[]

      const basePaths = [fileDir, fileContext.projectRoot]

      // Convert schemas and handle validation errors
      let promptSchema: AgentTemplate['promptSchema']
      try {
        promptSchema = this.convertPromptSchema(
          content.promptSchema?.prompt,
          content.promptSchema?.params,
          filePath
        )
      } catch (error) {
        this.validationErrors.push({
          filePath,
          message:
            error instanceof Error ? error.message : 'Schema conversion failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        })
        return
      }

      // Convert outputSchema if present
      let outputSchema: AgentTemplate['outputSchema']
      if (content.outputSchema) {
        try {
          outputSchema = convertJsonSchemaToZod(content.outputSchema)
        } catch (error) {
          this.validationErrors.push({
            filePath,
            message: `Failed to convert outputSchema to Zod: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: error instanceof Error ? error.message : 'Unknown error',
          })
          return
        }
      }

      // Determine outputMode: default to 'json' if outputSchema is present, otherwise 'last_message'
      const outputMode =
        content.outputMode ?? (content.outputSchema ? 'json' : 'last_message')

      // Convert to internal AgentTemplate format
      const agentTemplate: AgentTemplate = {
        ...content,
        outputMode,
        outputSchema,
        promptSchema,
        toolNames: content.toolNames as ToolName[],
        spawnableAgents: validatedSpawnableAgents,
      }

      this.templates[content.id] = agentTemplate
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'

      this.validationErrors.push({
        filePath,
        message: `Error in agent template ${filePath}: ${errorMessage}`,
        details: errorMessage,
      })
      logger.warn(
        { filePath, error: errorMessage },
        'Failed to load dynamic agent template'
      )
    }
  }

  /**
   * Convert JSON schema to Zod schema format using json-schema-to-zod.
   * This is done once during loading to avoid repeated conversions.
   * Throws descriptive errors for validation failures.
   */
  private convertPromptSchema(
    promptSchema?: Record<string, any>,
    paramsSchema?: Record<string, any>,
    filePath?: string
  ): AgentTemplate['promptSchema'] {
    const result: any = {}
    const fileContext = filePath ? ` in ${filePath}` : ''

    // Handle prompt schema
    if (promptSchema && Object.keys(promptSchema).length > 0) {
      try {
        const promptZodSchema = convertJsonSchemaToZod(promptSchema)

        // Validate that the schema results in string or undefined
        const testResult = promptZodSchema.safeParse('test')
        const testUndefined = promptZodSchema.safeParse(undefined)

        if (!testResult.success && !testUndefined.success) {
          const errorDetails =
            testResult.error?.issues?.[0]?.message || 'validation failed'
          throw new Error(
            `Invalid promptSchema.prompt${fileContext}: Schema must allow string or undefined values. ` +
              `Current schema validation error: ${errorDetails}. ` +
              `Please ensure your JSON schema accepts string types.`
          )
        }

        result.prompt = promptZodSchema
      } catch (error) {
        if (error instanceof Error && error.message.includes('promptSchema')) {
          // Re-throw our custom validation errors
          throw error
        }

        // Handle json-schema-to-zod conversion errors
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        throw new Error(
          `Failed to convert promptSchema.prompt to Zod${fileContext}: ${errorMessage}. ` +
            `Please check that your promptSchema.prompt is a valid JSON schema object.`
        )
      }
    }

    // Handle params schema
    if (paramsSchema && Object.keys(paramsSchema).length > 0) {
      try {
        const paramsZodSchema = convertJsonSchemaToZod(paramsSchema)
        result.params = paramsZodSchema
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        throw new Error(
          `Failed to convert promptSchema.params to Zod${fileContext}: ${errorMessage}. ` +
            `Please check that your promptSchema.params is a valid JSON schema object.`
        )
      }
    }

    return result
  }
  /**
   * Get a specific agent template by type
   */
  getTemplate(agentType: string): AgentTemplate | undefined {
    return this.templates[agentType]
  }
  /**
   * Get all loaded dynamic agent templates
   */
  getAllTemplates(): Record<string, AgentTemplate> {
    return { ...this.templates }
  }

  /**
   * Get validation errors from the last load operation
   */
  getValidationErrors(): DynamicAgentValidationError[] {
    return [...this.validationErrors]
  }

  /**
   * Check if an agent type exists in the loaded templates
   */
  hasAgent(agentType: string): boolean {
    return agentType in this.templates
  }

  /**
   * Get list of all loaded dynamic agent types
   */
  getAgentTypes(): string[] {
    return Object.keys(this.templates)
  }

  /**
   * Check if the service has been loaded
   */
  isServiceLoaded(): boolean {
    return this.isLoaded
  }

  /**
   * Reset the service (useful for testing)
   */
  reset(): void {
    this.templates = {}
    this.validationErrors = []
    this.isLoaded = false
  }
}

// Export a singleton instance
export const dynamicAgentService = new DynamicAgentService()
