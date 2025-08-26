import type { AgentTemplate } from './types'
import type {
  AgentState,
  AgentTemplateType,
} from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'

// Note: This is a simplified version for the agent-runtime package
// The full implementation with all placeholder substitutions is in the backend's TemplatesEnvironment

export async function getAgentPrompt<T extends 'systemPrompt' | 'instructionsPrompt' | 'stepPrompt'>(
  agentTemplate: AgentTemplate,
  promptType: { type: T },
  fileContext: ProjectFileContext,
  agentState: AgentState,
  agentTemplates: Record<string, AgentTemplate>,
): Promise<string | undefined> {
  // Simple implementation - just return the prompt value
  // The backend's TemplatesEnvironment handles full placeholder substitution
  return agentTemplate[promptType.type]
}
