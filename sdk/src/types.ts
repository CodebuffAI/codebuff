import type { AgentTemplateType } from '@codebuff/common/types/session-state'

export type CodebuffClientOptions = {
  apiKey: { type: 'string'; value: string } | { type: 'env' }
  cwd: string
}

export type ChatContext = {
  chatId: string
  agentId: string
}

export type NewChatOptions = {
  agent: AgentTemplateType
  prompt: string
  params?: Record<string, any>
}

export type ContinueChatOptions = {
  context: ChatContext
  agent?: AgentTemplateType
  prompt: string
  params?: Record<string, any>
  chatId?: string
}
