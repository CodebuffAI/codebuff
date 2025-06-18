import { AgentTemplateName } from 'common/types/agent-state'
import { claude4base } from './claude4base'
import { AgentTemplate } from './types'

export const agentTemplates: Record<AgentTemplateName, AgentTemplate> = {
  claude4base,
}
