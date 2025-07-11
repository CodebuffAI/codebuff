import { DynamicAgentTemplateSchema } from '@codebuff/common/types/dynamic-agent-template'
import {
  validateSpawnableAgents,
  formatSpawnableAgentError,
} from '@codebuff/common/util/agent-template-validation'
import { AgentTemplateType } from '@codebuff/common/types/session-state'
import { normalizeAgentNames } from '@codebuff/common/util/agent-name-normalization'
import { ProjectFileContext } from '@codebuff/common/util/file'
import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'
import { jsonSchemaToZod } from 'json-schema-to-zod'
import { resolvePromptField } from '../util/file-resolver'
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
   * Load and validate dynamic agent templates from .agents/templates directory
   */
  async loadAgents(
    fileContext: ProjectFileContext
  ): Promise<DynamicAgentLoadResult> {
    const templatesDir = path.join(fileContext.projectRoot, '.agents/templates')

    this.templates = {}
    this.validationErrors = []

    if (!fs.existsSync(templatesDir)) {
      logger.debug('No .agents/templates directory found')
      this.isLoaded = true
      return {
        templates: this.templates,
        validationErrors: this.validationErrors,
      }
    }

    try {
      const files = fs.readdirSync(templatesDir)
      const jsonFiles = files.filter((fileName) => fileName.endsWith('.json'))

      // Pass 1: Collect all agent IDs from template files
      const dynamicAgentIds = await this.collectAgentIds(
        templatesDir,
        jsonFiles
      )

      // Pass 2: Load and validate each agent template
      for (const fileName of jsonFiles) {
        await this.loadSingleAgent(
          templatesDir,
          fileName,
          dynamicAgentIds,
          fileContext
        )
      }
    } catch (error) {
      logger.error(
        { templatesDir, error },
        'Failed to read .agents/templates directory'
      )
      this.validationErrors.push({
        filePath: templatesDir,
        message: 'Failed to read templates directory',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
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
    templatesDir: string,
    jsonFiles: string[]
  ): Promise<string[]> {
    const agentIds: string[] = []

    for (const fileName of jsonFiles) {
      const filePath = path.join(templatesDir, fileName)

      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const parsedContent = JSON.parse(content)

        // Skip override templates (they modify existing agents)
        if (parsedContent.override !== false) {
          continue
        }

        // Extract the agent ID if it exists
        if (parsedContent.id && typeof parsedContent.id === 'string') {
          agentIds.push(parsedContent.id)
        }
      } catch (error) {
        // Log but don't fail the collection process
        logger.debug(
          { fileName, error },
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
    templatesDir: string,
    fileName: string,
    dynamicAgentIds: string[],
    fileContext: ProjectFileContext
  ): Promise<void> {
    const filePath = path.join(templatesDir, fileName)
    const relativeFilePath = `.agents/templates/${fileName}`
    const fileDir = path.join(
      fileContext.projectRoot,
      path.dirname(relativeFilePath)
    )

    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const parsedContent = JSON.parse(content)

      // Skip override templates (they modify existing agents)
      if (parsedContent.override !== false) {
        return
      }

      // Validate against schema
      const dynamicAgent = DynamicAgentTemplateSchema.parse(parsedContent)

      const spawnableValidation = validateSpawnableAgents(
        dynamicAgent.spawnableAgents,
        dynamicAgentIds
      )
      if (!spawnableValidation.valid) {
        this.validationErrors.push({
          filePath: relativeFilePath,
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
          relativeFilePath
        )
      } catch (error) {
        this.validationErrors.push({
          filePath: relativeFilePath,
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
        stopSequences: dynamicAgent.stopSequences,
        spawnableAgents: validatedSpawnableAgents,

        systemPrompt: resolvePromptField(dynamicAgent.systemPrompt, basePaths),
        userInputPrompt: resolvePromptField(
          dynamicAgent.userInputPrompt,
          basePaths
        ),
        agentStepPrompt: resolvePromptField(
          dynamicAgent.agentStepPrompt,
          basePaths
        ),

        initialAssistantMessage: undefined,
        initialAssistantPrefix: undefined,
        stepAssistantMessage: undefined,
        stepAssistantPrefix: undefined,
      }

      // Add optional prompt fields only if they exist
      if (dynamicAgent.initialAssistantMessage) {
        agentTemplate.initialAssistantMessage = resolvePromptField(
          dynamicAgent.initialAssistantMessage,
          basePaths
        )
      }

      if (dynamicAgent.initialAssistantPrefix) {
        agentTemplate.initialAssistantPrefix = resolvePromptField(
          dynamicAgent.initialAssistantPrefix,
          basePaths
        )
      }

      if (dynamicAgent.stepAssistantMessage) {
        agentTemplate.stepAssistantMessage = resolvePromptField(
          dynamicAgent.stepAssistantMessage,
          basePaths
        )
      }

      if (dynamicAgent.stepAssistantPrefix) {
        agentTemplate.stepAssistantPrefix = resolvePromptField(
          dynamicAgent.stepAssistantPrefix,
          basePaths
        )
      }

      this.templates[dynamicAgent.id] = agentTemplate
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      this.validationErrors.push({
        filePath: relativeFilePath,
        message: `Error in agent template ${relativeFilePath}: ${errorMessage}`,
        details: errorMessage,
      })
      logger.warn(
        { fileName, error: errorMessage },
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
