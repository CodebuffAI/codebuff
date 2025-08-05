import type { PrintModeObject } from '@codebuff/common/types/print-mode'
import type { AgentTemplateType } from '@codebuff/common/types/session-state'

export type CodebuffClientOptions = {
  apiKey: { type: 'string'; value: string } | { type: 'env' }
  cwd: string
}

export type InputType =
  | { prompt: string; params?: Record<string, any> }
  | { prompt?: string; params: Record<string, any> }
  | { prompt: string; params: Record<string, any> }

export type ChatContext = {
  agentId: string
  chatId?: string
}

export type NewChatOptions = {
  agent: AgentTemplateType
  input: InputType
  handleEvent: (event: PrintModeObject) => void
}

export type ContinueChatOptions = {
  context: ChatContext
  agent?: AgentTemplateType
  input: InputType
  chatId?: string
  handleEvent: (event: PrintModeObject) => void
}
