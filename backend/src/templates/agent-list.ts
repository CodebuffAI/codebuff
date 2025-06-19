import { AgentTemplateName } from 'common/types/agent-state'

import { claude4base } from './agents/claude4base'
import { experimental } from './agents/experimental'
import { AgentTemplate } from './types'

export const agentTemplates: Record<AgentTemplateName, AgentTemplate> = {
  claude4base,
  experimental,
}
