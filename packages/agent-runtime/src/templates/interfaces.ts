import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { AgentTemplateType, AgentState } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'

/**
 * Templates environment for agent template loading and prompt generation
 */
export interface TemplatesEnvironment {
  /**
   * Get an agent template by type
   */
  getAgentTemplate: (
    agentType: AgentTemplateType,
    localTemplates: Record<string, AgentTemplate>
  ) => Promise<AgentTemplate | null>

  /**
   * Get an agent prompt for a specific type
   */
  getAgentPrompt: (
    template: AgentTemplate,
    promptType: { type: 'systemPrompt' | 'instructionsPrompt' | 'stepPrompt' },
    fileContext: ProjectFileContext,
    agentState: AgentState,
    localTemplates: Record<string, AgentTemplate>
  ) => Promise<string | undefined>
}
