import type { ChatTheme } from './theme-system'
import type { ReactNode } from 'react'
import type { ToolName } from '@codebuff/sdk'

export type ChatVariant = 'ai' | 'user' | 'agent' | 'error'

export type TextContentBlock = {
  type: 'text'
  content: string
  color?: string
  marginTop?: number
  marginBottom?: number
  status?: 'running' | 'complete'
  textType?: 'reasoning' | 'text'
  isCollapsed?: boolean
  thinkingId?: string
  userOpened?: boolean
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
  toolName: ToolName
  input: any
  output?: string
  outputRaw?: unknown
  agentId?: string
  includeToolCall?: boolean
  isCollapsed?: boolean
  userOpened?: boolean
}
export type AgentContentBlock = {
  type: 'agent'
  agentId: string
  agentName: string
  agentType: string
  content: string
  status: 'running' | 'complete' | 'failed'
  blocks?: ContentBlock[]
  initialPrompt?: string
  params?: Record<string, any>
  isCollapsed?: boolean
  userOpened?: boolean
}
export type AgentListContentBlock = {
  type: 'agent-list'
  id: string
  agents: Array<{ id: string; displayName: string }>
  agentsDir: string
  isCollapsed?: boolean
  userOpened?: boolean
}
export type ModeDividerContentBlock = {
  type: 'mode-divider'
  mode: string
}

export type PlanContentBlock = {
  type: 'plan'
  content: string
}

export type AskUserContentBlock = {
  type: 'ask-user'
  toolCallId: string
  questions: Array<{
    question: string
    header?: string
    options: Array<{
      label: string
      description?: string
    }>
    multiSelect?: boolean
    validation?: {
      maxLength?: number
      minLength?: number
      pattern?: string
      patternError?: string
    }
  }>
  answers?: Array<{
    questionIndex: number
    selectedOption?: string
    selectedOptions?: string[]
    otherText?: string
  }>
  skipped?: boolean
}

export type ContentBlock =
  | AgentContentBlock
  | AgentListContentBlock
  | HtmlContentBlock
  | ModeDividerContentBlock
  | TextContentBlock
  | ToolContentBlock
  | PlanContentBlock
  | AskUserContentBlock

export type AgentMessage = {
  agentName: string
  agentType: string
  responseCount: number
  subAgentCount?: number
}

export type ChatMessageMetadata = {
  /** Working directory where a bash command was executed */
  bashCwd?: string
  /** Whether this message/agent is collapsed in the UI */
  isCollapsed?: boolean
  /** Whether the user manually opened this collapsed item */
  userOpened?: boolean
  /** RunState stored after completion */
  runState?: unknown
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
  metadata?: ChatMessageMetadata
  validationErrors?: Array<{ id: string; message: string }>
}

// Type guard functions for safe type narrowing
export function isTextBlock(block: ContentBlock): block is TextContentBlock {
  return block.type === 'text'
}

export function isToolBlock(block: ContentBlock): block is ToolContentBlock {
  return block.type === 'tool'
}

export function isAgentBlock(block: ContentBlock): block is AgentContentBlock {
  return block.type === 'agent'
}

export function isHtmlBlock(block: ContentBlock): block is HtmlContentBlock {
  return block.type === 'html'
}

export function isAgentListBlock(
  block: ContentBlock,
): block is AgentListContentBlock {
  return block.type === 'agent-list'
}

export function isPlanBlock(block: ContentBlock): block is PlanContentBlock {
  return block.type === 'plan'
}

export function isModeDividerBlock(
  block: ContentBlock,
): block is ModeDividerContentBlock {
  return block.type === 'mode-divider'
}

export function isAskUserBlock(
  block: ContentBlock,
): block is AskUserContentBlock {
  return block.type === 'ask-user'
}
