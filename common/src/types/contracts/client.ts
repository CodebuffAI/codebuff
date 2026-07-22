import type { ServerAction } from '../../actions'
import type { MCPConfig } from '../mcp'
import type { ToolResultOutput } from '../messages/content-part'
import type {
  CommitReceiptV1,
  ReadFilesResultV1,
} from '../../tools/results/filesystem'
import type { ReadCapabilityIssuer } from '../../util/content-hash'

export type RequestToolCallFn = (params: {
  userInputId: string
  callId?: string
  toolName: string
  input: Record<string, any> & { timeout_seconds?: number }
  mcpConfig?: MCPConfig
  signal?: AbortSignal
}) => Promise<{
  output: ToolResultOutput[]
  canonicalReceipt?: CommitReceiptV1
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

export type FileLineRange = {
  path: string
  startLine?: number
  endLine?: number
}

export type RequestFilesFn = (params: {
  filePaths: string[]
  ranges?: FileLineRange[]
  /** Runtime-only issuer scope used to mint non-replayable cap.v3 tokens. */
  capabilityIssuer?: ReadCapabilityIssuer
}) => Promise<ReadFilesResultV1>

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
