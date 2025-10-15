import type { ServerAction } from '../../actions'
import type { MCPConfig } from '../mcp'
import type { ToolResultOutput } from '../messages/content-part'

export type RequestToolCallFn = (params: {
  userInputId: string
  toolName: string
  input: Record<string, any> & { timeout_seconds?: number }
  mcpConfig?: MCPConfig
}) => Promise<{
  output: ToolResultOutput[]
}>

export type RequestMcpToolDataFn = (params: {
  mcpConfig: MCPConfig
  toolNames: string[] | null
}) => Promise<
  {
    name: string
    description?: string
    inputSchema: unknown
  }[]
>

export type RequestFilesFn = (params: {
  filePaths: string[]
}) => Promise<Record<string, string | null>>

export type RequestOptionalFileFn = (params: {
  filePath: string
}) => Promise<string | null>

export type SendSubagentChunkFn = (params: {
  userInputId: string
  agentId: string
  agentType: string
  chunk: string
  prompt?: string | undefined
  forwardToPrompt?: boolean
}) => void

export type HandleStepsLogChunkFn = (params: {
  userInputId: string
  runId: string
  level: 'debug' | 'info' | 'warn' | 'error'
  data: unknown
  message?: string
}) => void

export type SendActionFn = (params: { action: ServerAction }) => void
