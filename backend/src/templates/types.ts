import { ToolName } from '@/tools'
import { Model } from 'common/constants'
import { AgentTemplateName } from 'common/types/agent-state'

export type AgentTemplate = {
  name: AgentTemplateName
  description: string
  model: Model
  systemPrompt: string
  userInputPrompt: string
  agentStepPrompt: string
  toolNames: ToolName[]
}
