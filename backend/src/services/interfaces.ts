import { AgentState, AgentTemplateType, ToolResult } from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { CodebuffMessage } from '@codebuff/common/types/message'
import { CoreMessage } from 'ai'
import { WebSocket } from 'ws'
import { ClientToolCall, CodebuffToolCall } from '../features/tools/constants'

// Agent Service Interface
export interface IAgentService {
  executeAgent(options: AgentExecutionOptions): Promise<AgentExecutionResult>
  loopAgentSteps(options: AgentLoopOptions): Promise<AgentLoopResult>
}

export interface AgentExecutionOptions {
  ws: WebSocket
  userId: string | undefined
  userInputId: string
  clientSessionId: string
  fingerprintId: string
  onResponseChunk: (chunk: string) => void
  agentType: AgentTemplateType
  fileContext: ProjectFileContext
  agentState: AgentState
  prompt: string | undefined
  params: Record<string, any> | undefined
  assistantMessage: string | undefined
  assistantPrefix: string | undefined
}

export interface AgentExecutionResult {
  agentState: AgentState
  fullResponse: string
  shouldEndTurn: boolean
}

export interface AgentLoopOptions {
  userInputId: string
  agentType: AgentTemplateType
  agentState: AgentState
  prompt: string | undefined
  params: Record<string, any> | undefined
  fingerprintId: string
  fileContext: ProjectFileContext
  toolResults: ToolResult[]
  userId: string | undefined
  clientSessionId: string
  onResponseChunk: (chunk: string) => void
}

export interface AgentLoopResult {
  agentState: AgentState
  hasEndTurn?: boolean
}

// Tool Service Interface
export interface IToolService {
  executeTool(toolCall: CodebuffToolCall, options: ToolExecutionOptions): Promise<ToolResult>
}

export interface ToolExecutionOptions {
  ws: WebSocket
  userId?: string
  userInputId: string
  clientSessionId: string
  fingerprintId: string
  agentStepId: string
  fileContext: ProjectFileContext
  messages: CoreMessage[]
  repoId?: string
  agentState?: AgentState
}

// LLM Service Interface
export interface ILLMService {
  generateResponse(options: LLMGenerationOptions): AsyncGenerator<string>
  generateStructuredResponse<T>(options: StructuredLLMOptions<T>): Promise<T>
}

export interface LLMGenerationOptions {
  messages: CoreMessage[]
  model: string
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
  chargeUser?: boolean
  thinkingBudget?: number
  maxRetries?: number
}

export interface StructuredLLMOptions<T> extends LLMGenerationOptions {
  schema: any // Zod schema
  maxTokens?: number
  temperature?: number
  timeout?: number
}

// File Service Interface
export interface IFileService {
  processFileBlock(options: FileProcessingOptions): Promise<FileProcessingResult>
  processStrReplace(options: StrReplaceOptions): Promise<FileProcessingResult>
  getFileReadingUpdates(options: FileReadingOptions): Promise<FileReadingResult>
}

export interface FileProcessingOptions {
  path: string
  instructions: string
  latestContentPromise: Promise<string>
  content: string
  agentMessages: CodebuffMessage[]
  fullResponse: string
  prompt?: string
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId?: string
}

export interface StrReplaceOptions {
  path: string
  replacements: Array<{ old: string; new: string }>
  latestContentPromise: Promise<string>
}

export interface FileProcessingResult {
  tool: 'write_file' | 'str_replace' | 'create_plan'
  path: string
  content?: string
  patch?: string
  messages?: string[]
  error?: string
}

export interface FileReadingOptions {
  ws: WebSocket
  messages: CodebuffMessage[] | CoreMessage[]
  fileContext: ProjectFileContext
  requestedFiles?: string[]
  agentStepId: string
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId?: string
  repoId?: string
}

export interface FileReadingResult {
  addedFiles: Array<{ path: string; content: string }>
  updatedFilePaths: string[]
  printedPaths?: string[]
  clearReadFileToolResults?: boolean
}

// WebSocket Service Interface
export interface IWebSocketService {
  sendAction(ws: WebSocket, action: any): void
  requestFiles(ws: WebSocket, filePaths: string[]): Promise<Record<string, string | null>>
  requestFile(ws: WebSocket, filePath: string): Promise<string | null>
  requestOptionalFile(ws: WebSocket, filePath: string): Promise<string>
  requestToolCall<T = any>(
    ws: WebSocket,
    userInputId: string,
    toolName: string,
    args: Record<string, any>
  ): Promise<{ success: boolean; result?: T; error?: string }>
}
