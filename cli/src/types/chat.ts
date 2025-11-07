import type { ChatTheme } from './theme-system'
import type { ReactNode } from 'react'

export type ChatVariant = 'ai' | 'user' | 'agent' | 'error'

export type TextContentBlock = {
  type: 'text'
  content: string
  color?: string
  marginTop?: number
  marginBottom?: number
  status?: 'running' | 'complete'
  textType?: 'reasoning' | 'text'
}
export type HtmlContentBlock = {
  type: 'html'
  marginTop?: number
  marginBottom?: number
  render: (context: { textColor: string; theme: ChatTheme }) => ReactNode
}
export type ToolContentBlock = {
  type: 'tool'
  toolCallId: string
  toolName: string
  input: any
  output?: string
  outputRaw?: unknown
  agentId?: string
  includeToolCall?: boolean
}
export type AgentContentBlock = {
  type: 'agent'
  agentId: string
  agentName: string
  agentType: string
  content: string
  status: 'running' | 'complete'
  blocks?: ContentBlock[]
  initialPrompt?: string
}
export type AgentListContentBlock = {
  type: 'agent-list'
  id: string
  agents: Array<{ id: string; displayName: string }>
  agentsDir: string
}
export type ContentBlock =
  | AgentContentBlock
  | AgentListContentBlock
  | HtmlContentBlock
  | TextContentBlock
  | ToolContentBlock

export type AgentMessage = {
  agentName: string
  agentType: string
  responseCount: number
  subAgentCount?: number
}

export type ChatMessage = {
  id: string
  variant: ChatVariant
  content: string
  blocks?: ContentBlock[]
  timestamp: string
  parentId?: string
  agent?: AgentMessage
  isCompletion?: boolean
  credits?: number
  completionTime?: string
  isComplete?: boolean
  metadata?: Record<string, any>
}
