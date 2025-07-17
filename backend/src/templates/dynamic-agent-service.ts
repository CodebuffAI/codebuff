import * as path from 'path'

import { DynamicAgentTemplateSchema } from '@codebuff/common/types/dynamic-agent-template'
import { AgentTemplateType } from '@codebuff/common/types/session-state'
import { normalizeAgentNames } from '@codebuff/common/util/agent-name-normalization'
import {
  formatSpawnableAgentError,
  validateSpawnableAgents,
} from '@codebuff/common/util/agent-template-validation'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { jsonSchemaToZod } from 'json-schema-to-zod'
import { z } from 'zod'

import { logger } from '../util/logger'
import { AgentTemplate, AgentTemplateUnion } from './types'

export interface DynamicAgentValidationError {
  filePath: string
  message: string
  details?: string
}

export interface DynamicAgentLoadResult {
  templates: Record<string, AgentTemplateUnion>
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
      // Use agentTemplates from fileContext - keys are already full paths
      const jsonFiles = Object.keys(agentTemplates).filter((filePath) =>
        filePath.endsWith('.json')
      )

      // Pass 1: Collect all agent IDs from template files
      const dynamicAgentIds = await this.collectAgentIds(
        jsonFiles,
        agentTemplates
      )

      // Pass 2: Load and validate each agent template
      for (const filePath of jsonFiles) {
        await this.loadSingleAgent(
          filePath,
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
    agentTemplates: Record<string, string> = {}
  ): Promise<string[]> {
    const agentIds: string[] = []

    for (const filePath of jsonFiles) {
      try {
        const content = agentTemplates[filePath]
        if (!content) {
          continue
        }

        const parsedContent = JSON.parse(content)

        // Throw error if override: true is found
        if (parsedContent.override === true) {
          throw new Error(
            `Dynamic agents no longer support override: true. Found in ${filePath}. ` +
              `Please set override: false or remove the override field entirely.`
          )
        }

        // Extract the agent ID if it exists
        if (parsedContent.id && typeof parsedContent.id === 'string') {
          agentIds.push(parsedContent.id)
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
    agentTemplates: Record<string, string> = {}
  ): Promise<void> {
    const fileDir = path.join(fileContext.projectRoot, path.dirname(filePath))

    try {
      const content = agentTemplates[filePath]
      if (!content) {
        return
      }

      const parsedContent = JSON.parse(content)

      // Throw error if override: true is found
      if (parsedContent.override === true) {
        throw new Error(
          `Dynamic agents no longer support override: true. Found in ${filePath}. ` +
            `Please set override: false or remove the override field entirely.`
        )
      }

      // Validate against schema
      const dynamicAgent = DynamicAgentTemplateSchema.parse(parsedContent)

      const spawnableValidation = validateSpawnableAgents(
        dynamicAgent.spawnableAgents,
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

      const validatedSpawnableAgents = normalizeAgentNames(
        dynamicAgent.spawnableAgents
      ) as AgentTemplateType[]

      const basePaths = [fileDir, fileContext.projectRoot]

      // Convert schemas and handle validation errors
      let promptSchema: AgentTemplate['promptSchema']
      try {
        promptSchema = this.convertPromptSchema(
          dynamicAgent.promptSchema?.prompt,
          dynamicAgent.promptSchema?.params,
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

      // Convert to internal AgentTemplate format
      const agentTemplate: AgentTemplate = {
        id: dynamicAgent.id as AgentTemplateType,
        name: dynamicAgent.name,
        implementation: 'llm',
        description: dynamicAgent.description,
        model: dynamicAgent.model as any,
        promptSchema,
        outputMode: dynamicAgent.outputMode,
        includeMessageHistory: dynamicAgent.includeMessageHistory,
        toolNames: dynamicAgent.toolNames as any[],
        spawnableAgents: validatedSpawnableAgents,

        systemPrompt: this.resolvePromptFieldFromAgentTemplates(
          dynamicAgent.systemPrompt,
          agentTemplates,
          basePaths
        ),
        userInputPrompt: this.resolvePromptFieldFromAgentTemplates(
          dynamicAgent.userInputPrompt,
          agentTemplates,
          basePaths
        ),
        agentStepPrompt: this.resolvePromptFieldFromAgentTemplates(
          dynamicAgent.agentStepPrompt,
          agentTemplates,
          basePaths
        ),

        initialAssistantMessage: undefined,
        initialAssistantPrefix: undefined,
        stepAssistantMessage: undefined,
        stepAssistantPrefix: undefined,
      }

      // Add optional prompt fields only if they exist
      if (dynamicAgent.initialAssistantMessage) {
        agentTemplate.initialAssistantMessage =
          this.resolvePromptFieldFromAgentTemplates(
            dynamicAgent.initialAssistantMessage,
            agentTemplates,
            basePaths
          )
      }

      if (dynamicAgent.initialAssistantPrefix) {
        agentTemplate.initialAssistantPrefix =
          this.resolvePromptFieldFromAgentTemplates(
            dynamicAgent.initialAssistantPrefix,
            agentTemplates,
            basePaths
          )
      }

      if (dynamicAgent.stepAssistantMessage) {
        agentTemplate.stepAssistantMessage =
          this.resolvePromptFieldFromAgentTemplates(
            dynamicAgent.stepAssistantMessage,
            agentTemplates,
            basePaths
          )
      }

      if (dynamicAgent.stepAssistantPrefix) {
        agentTemplate.stepAssistantPrefix =
          this.resolvePromptFieldFromAgentTemplates(
            dynamicAgent.stepAssistantPrefix,
            agentTemplates,
            basePaths
          )
      }

      this.templates[dynamicAgent.id] = agentTemplate
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
   * Resolve prompt field from agentTemplates with enhanced path resolution
   */
  private resolvePromptFieldFromAgentTemplates(
    promptField: string | { path: string } | undefined,
    agentTemplates: Record<string, string>,
    basePaths: string[]
  ): string {
    if (!promptField) return ''

    if (typeof promptField === 'string') {
      return promptField
    }

    if (typeof promptField === 'object' && promptField.path) {
      const originalPath = promptField.path

      // Try multiple path variations for better compatibility
      const pathVariations = [
        originalPath, // Original path as-is
        `.agents/templates/${path.basename(originalPath)}`, // Full prefixed path
        originalPath.replace(/^\.\//, ''), // Remove leading ./
      ]

      for (const pathVariation of pathVariations) {
        const content = agentTemplates[pathVariation]
        if (content !== undefined) {
          return content
        }
      }

      // No filesystem fallback - return empty string if not found in agentTemplates
      return ''
    }

    return ''
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
        const zodSchemaCode = jsonSchemaToZod(promptSchema)
        const schemaFunction = new Function('z', `return ${zodSchemaCode}`)
        const promptZodSchema = schemaFunction(z)

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
        const zodSchemaCode = jsonSchemaToZod(paramsSchema)
        const schemaFunction = new Function('z', `return ${zodSchemaCode}`)
        result.params = schemaFunction(z)
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
