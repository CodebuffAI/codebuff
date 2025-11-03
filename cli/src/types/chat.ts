import type { ChatTheme } from './theme-system'
import type { ToolName } from '@codebuff/sdk'
import type { ReactNode } from 'react'

export type ChatVariant = 'ai' | 'user' | 'agent' | 'error'

export type ContentBlock =
  | {
      type: 'text'
      content: string
      color?: string
      marginTop?: number
      marginBottom?: number
      status?: 'running' | 'complete'
    }
  | {
      type: 'html'
      marginTop?: number
      marginBottom?: number
      render: (context: { textColor: string; theme: ChatTheme }) => ReactNode
    }
  | {
      type: 'tool'
      toolCallId: string
      toolName: ToolName
      input: any
      output?: string
      outputRaw?: unknown
      agentId?: string
    }
  | {
      type: 'agent'
      agentId: string
      agentName: string
      agentType: string
      content: string
      status: 'running' | 'complete'
      blocks?: ContentBlock[]
      initialPrompt?: string
    }
  | {
      type: 'agent-list'
      id: string
      agents: Array<{ id: string; displayName: string }>
      agentsDir: string
    }

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
