import type { PrintModeEvent } from '../../common/src/types/print-mode'
import type { AgentTemplateType } from '../../common/src/types/session-state'

export type CodebuffClientOptions = {
  cwd: string
}

export type ChatContext = {
  agentId: string
  chatId?: string
}

export type NewChatOptions = {
  agent: AgentTemplateType
  prompt: string
  params?: Record<string, any>
  handleEvent: (event: PrintModeEvent) => void
}

export type ContinueChatOptions = {
  context: ChatContext
  agent?: AgentTemplateType
  prompt: string
  params?: Record<string, any>
  chatId?: string
  handleEvent: (event: PrintModeEvent) => void
}
