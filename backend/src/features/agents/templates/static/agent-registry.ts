import { AGENT_NAMES } from '@codebuff/common/constants/agents'
import { ProjectFileContext } from '@codebuff/common/util/file'

import { agentTemplates as staticTemplates } from './agent-list'
import { dynamicAgentService } from './dynamic-agent-service'
import { AgentTemplate, AgentTemplateUnion } from './types'
import { logger } from '../../../../util/logger'

/**
 * Global agent registry that combines static and dynamic agents
 */
class AgentRegistry {
  private allTemplates: Record<string, AgentTemplateUnion> = {}
  private allAgentNames: Record<string, string> = {}
  private isInitialized = false
  private validationErrors: Array<{ filePath: string; message: string }> = []

  /**
   * Initialize the registry with a file context (needed for dynamic agent loading)
   */
  async initialize(fileContext: ProjectFileContext): Promise<void> {
    if (this.isInitialized) {
      return
    }

    // Load dynamic agents using the service
    const { templates: dynamicTemplates, validationErrors } =
      await dynamicAgentService.loadAgents(fileContext)

    // Combine static and dynamic templates
    const allTemplates = { ...staticTemplates, ...dynamicTemplates }
    const allAgentTypes = Object.keys(allTemplates)

    // Update base agent templates to include all available agents
    const updatedTemplates = { ...allTemplates }
    const baseAgentTypes = [
      'base',
      'base_lite',
      'base_max',
      'base_experimental',
      'claude4_gemini_thinking',
      'ask',
    ]
    for (const baseType of baseAgentTypes) {
      if (updatedTemplates[baseType]) {
        updatedTemplates[baseType] = {
          ...updatedTemplates[baseType],
          spawnableAgents: allAgentTypes as any[],
        }
      }
    }

    this.allTemplates = updatedTemplates
    this.validationErrors = validationErrors

    // Build combined agent names map (static + dynamic)
    this.allAgentNames = {
      ...AGENT_NAMES,
      ...Object.fromEntries(
        Object.entries(dynamicTemplates).map(([type, template]) => [
          type,
          template.name,
        ])
      ),
    }

    this.isInitialized = true

    if (this.validationErrors.length > 0) {
      logger.warn(
        { errors: this.validationErrors },
        'Dynamic agent template validation errors'
      )
    }
  }

  /**
   * Get agent name by type (includes dynamic agents)
   */
  getAgentName(agentType: string): string | undefined {
    if (!this.isInitialized) {
      return AGENT_NAMES[agentType as keyof typeof AGENT_NAMES]
    }

    return this.allAgentNames[agentType]
  }

  /**
   * Get all agent names (static + dynamic)
   */
  getAllAgentNames(): Record<string, string> {
    if (!this.isInitialized) {
      return AGENT_NAMES
    }

    return { ...this.allAgentNames }
  }

  /**
   * Get an agent template by type
   */
  getTemplate(agentType: string): AgentTemplateUnion | undefined {
    if (!this.isInitialized) {
      logger.warn(
        'Agent registry not initialized, falling back to static templates only'
      )
      return staticTemplates[agentType as keyof typeof staticTemplates]
    }

    return this.allTemplates[agentType]
  }

  /**
   * Get all available agent templates
   */
  getAllTemplates(): Record<string, AgentTemplateUnion> {
    if (!this.isInitialized) {
      logger.warn(
        'Agent registry not initialized, falling back to static templates only'
      )
      return staticTemplates
    }

    return { ...this.allTemplates }
  }

  /**
   * Get validation errors from dynamic agent loading
   */
  getValidationErrors(): Array<{ filePath: string; message: string }> {
    return [...this.validationErrors]
  }

  /**
   * Check if an agent type exists
   */
  hasAgent(agentType: string): boolean {
    if (!this.isInitialized) {
      return agentType in staticTemplates
    }

    return agentType in this.allTemplates
  }

  /**
   * Get list of all available agent types
   */
  getAvailableTypes(): string[] {
    if (!this.isInitialized) {
      return Object.keys(staticTemplates)
    }

    return Object.keys(this.allTemplates)
  }

  /**
   * Reset the registry (for testing)
   */
  reset(): void {
    this.allTemplates = {}
    this.allAgentNames = {}
    this.isInitialized = false
    this.validationErrors = []
  }
}

// Global singleton instance
export const agentRegistry = new AgentRegistry()
