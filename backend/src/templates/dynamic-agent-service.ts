import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'
import {
  DynamicAgentTemplateSchema,
  validateSpawnableAgents,
} from '@codebuff/common/types/dynamic-agent-template'
import {
  AgentTemplateType,
  AgentTemplateTypes,
} from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { normalizeAgentNames } from '@codebuff/common/util/agent-name-normalization'
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

    // Get available agent types for validation
    const availableAgentTypes = [
      ...Object.values(AgentTemplateTypes),
      ...Object.keys(this.templates), // Include any already loaded dynamic agents
    ]

    try {
      const files = fs.readdirSync(templatesDir)
      logger.info(
        { templatesDir, fileCount: files.length },
        'Loading dynamic agent templates'
      )

      for (const fileName of files) {
        if (!fileName.endsWith('.json')) {
          continue
        }

        await this.loadSingleAgent(
          templatesDir,
          fileName,
          availableAgentTypes,
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

    logger.info(
      {
        loadedAgents: Object.keys(this.templates).length,
        validationErrors: this.validationErrors.length,
        agentTypes: Object.keys(this.templates),
      },
      'Dynamic agent loading complete'
    )

    return {
      templates: this.templates,
      validationErrors: this.validationErrors,
    }
  }

  /**
   * Load and validate a single agent template file
   */
  private async loadSingleAgent(
    templatesDir: string,
    fileName: string,
    availableAgentTypes: string[],
    fileContext: ProjectFileContext
  ): Promise<void> {
    const filePath = path.join(templatesDir, fileName)
    const relativeFilePath = `.agents/templates/${fileName}`

    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const parsedContent = JSON.parse(content)

      // Skip override templates (they modify existing agents)
      if (parsedContent.override !== false) {
        logger.debug(
          { fileName, override: parsedContent.override },
          'Skipping override template'
        )
        return
      }

      // Validate against schema
      const dynamicAgent = DynamicAgentTemplateSchema.parse(parsedContent)

      // Validate spawnable agents
      const normalizedSpawnableAgents = normalizeAgentNames(
        dynamicAgent.spawnableAgents
      )
      const spawnableValidation = validateSpawnableAgents(
        normalizedSpawnableAgents,
        availableAgentTypes
      )

      if (!spawnableValidation.valid) {
        this.validationErrors.push({
          filePath: relativeFilePath,
          message: `Invalid spawnable agents: ${spawnableValidation.invalidAgents.join(', ')}`,
          details: `Available agents: ${availableAgentTypes.join(', ')}`,
        })
        return
      }

      // Convert to internal AgentTemplate format
      const agentTemplate: AgentTemplate = {
        type: dynamicAgent.type as AgentTemplateType,
        name: dynamicAgent.name,
        implementation: 'llm',
        description: dynamicAgent.description,
        model: dynamicAgent.model as any,
        promptSchema: this.convertPromptSchema(dynamicAgent.promptSchema),
        outputMode: dynamicAgent.outputMode,
        includeMessageHistory: dynamicAgent.includeMessageHistory,
        toolNames: dynamicAgent.toolNames as any[],
        stopSequences: dynamicAgent.stopSequences,
        spawnableAgents: normalizedSpawnableAgents as AgentTemplateType[],

        systemPrompt: resolvePromptField(
          dynamicAgent.systemPrompt,
          fileContext.projectRoot
        ),
        userInputPrompt: resolvePromptField(
          dynamicAgent.userInputPrompt,
          fileContext.projectRoot
        ),
        agentStepPrompt: resolvePromptField(
          dynamicAgent.agentStepPrompt,
          fileContext.projectRoot
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
          fileContext.projectRoot
        )
      }

      if (dynamicAgent.initialAssistantPrefix) {
        agentTemplate.initialAssistantPrefix = resolvePromptField(
          dynamicAgent.initialAssistantPrefix,
          fileContext.projectRoot
        )
      }

      if (dynamicAgent.stepAssistantMessage) {
        agentTemplate.stepAssistantMessage = resolvePromptField(
          dynamicAgent.stepAssistantMessage,
          fileContext.projectRoot
        )
      }

      if (dynamicAgent.stepAssistantPrefix) {
        agentTemplate.stepAssistantPrefix = resolvePromptField(
          dynamicAgent.stepAssistantPrefix,
          fileContext.projectRoot
        )
      }

      this.templates[dynamicAgent.type] = agentTemplate

      logger.debug(
        { agentType: dynamicAgent.type, filePath: relativeFilePath },
        'Loaded dynamic agent'
      )
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      this.validationErrors.push({
        filePath: relativeFilePath,
        message: 'Failed to load agent template',
        details: errorMessage,
      })
      logger.warn(
        { fileName, error: errorMessage },
        'Failed to load dynamic agent template'
      )
    }
  }

  /**
   * Convert dynamic agent prompt schema to internal Zod schema format.
   * This is done once during loading to avoid repeated conversions.
   */
  private convertPromptSchema(
    promptSchema?: Record<string, { type: string; description: string }>
  ): AgentTemplate['promptSchema'] {
    const result: any = {}

    if (promptSchema && Object.keys(promptSchema).length > 0) {
      for (const [key, field] of Object.entries(promptSchema)) {
        // Convert each field to a Zod schema based on type
        switch (field.type) {
          case 'string':
            result[key] = z.string().describe(field.description)
            break
          case 'number':
            result[key] = z.number().describe(field.description)
            break
          case 'boolean':
            result[key] = z.boolean().describe(field.description)
            break
          case 'array':
            result[key] = z.array(z.string()).describe(field.description)
            break
          default:
            // Fallback to string for unknown types
            result[key] = z.string().describe(field.description)
            logger.warn(
              { type: field.type, key },
              'Unknown schema type, defaulting to string'
            )
        }
      }
    } else {
      // Default schema for agents without custom parameters
      result.prompt = z.string().describe('A coding task to complete')
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
