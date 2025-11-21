import { z } from 'zod/v4'

import { GrantTypeValues } from './types/grant'
import { mcpConfigSchema } from './types/mcp'
import { toolMessageSchema } from './types/messages/codebuff-message'
import { printModeEventSchema } from './types/print-mode'
import {
  AgentOutputSchema,
  SessionStateSchema,
  toolCallSchema,
} from './types/session-state'

import type { CostMode } from './old-constants'
import type { ToolMessage } from './types/messages/codebuff-message'
import type {
  TextPart,
  ImagePart,
  ToolResultOutput,
} from './types/messages/content-part'
import type { SessionState } from './types/session-state'
import type { ProjectFileContext } from './util/file'

export const FileChangeSchema = z.object({
  type: z.enum(['patch', 'file']),
  path: z.string(),
  content: z.string(),
})
export type FileChange = z.infer<typeof FileChangeSchema>
export const CHANGES = z.array(FileChangeSchema)
export type FileChanges = z.infer<typeof CHANGES>

type ClientActionPrompt = {
  type: 'prompt'
  promptId: string
  prompt: string | undefined
  content?: (TextPart | ImagePart)[]
  promptParams?: Record<string, any> // Additional json params.
  fingerprintId: string
  authToken?: string
  costMode?: CostMode
  sessionState: SessionState
  toolResults: ToolMessage[]
  model?: string
  repoUrl?: string
  agentId?: string
}

type ClientActionReadFilesResponse = {
  type: 'read-files-response'
  files: Record<string, string | null>
  requestId?: string
}

type ClientActionInit = {
  type: 'init'
  fingerprintId: string
  authToken?: string
  fileContext: ProjectFileContext
  repoUrl?: string
}

type ClientActionToolCallResponse = {
  type: 'tool-call-response'
  requestId: string
  output: ToolResultOutput[]
}

type ClientActionCancelUserInput = {
  type: 'cancel-user-input'
  authToken: string
  promptId: string
}

type ClientActionMcpToolData = {
  type: 'mcp-tool-data'
  requestId: string
  tools: {
    name: string
    description?: string
    inputSchema: { type: 'object'; [k: string]: unknown }
  }[]
}

type ClientActionAny =
  | ClientActionPrompt
  | ClientActionReadFilesResponse
  | ClientActionInit
  | ClientActionToolCallResponse
  | ClientActionCancelUserInput
  | ClientActionMcpToolData
type ClientActionType = ClientActionAny['type']
export type ClientAction<T extends ClientActionType = ClientActionType> = {
  [K in ClientActionType]: Extract<
    ClientActionAny,
    {
      type: K
    }
  >
}[T]

export const UsageReponseSchema = z.object({
  type: z.literal('usage-response'),
  usage: z.number(),
  remainingBalance: z.number(),
  balanceBreakdown: z
    .record(
      z.enum([GrantTypeValues[0], ...GrantTypeValues.slice(1)]),
      z.number(),
    )
    .optional(),
  next_quota_reset: z.coerce.date().nullable(),
  autoTopupAdded: z.number().optional(),
})
export type UsageResponse = z.infer<typeof UsageReponseSchema>

export const InitResponseSchema = z
  .object({
    type: z.literal('init-response'),
    message: z.string().optional(),
    agentNames: z.record(z.string(), z.string()).optional(),
  })
  .merge(
    UsageReponseSchema.omit({
      type: true,
    }),
  )
export type InitResponse = z.infer<typeof InitResponseSchema>

export const MessageCostResponseSchema = z.object({
  type: z.literal('message-cost-response'),
  promptId: z.string(),
  credits: z.number(),
  agentId: z.string().optional(),
})
export type MessageCostResponse = z.infer<typeof MessageCostResponseSchema>

export const PromptResponseSchema = z.object({
  type: z.literal('prompt-response'),
  promptId: z.string(),
  sessionState: SessionStateSchema,
  toolCalls: z.array(toolCallSchema).optional(),
  toolResults: z.array(toolMessageSchema).optional(),
  output: AgentOutputSchema.optional(),
})
export type PromptResponse = z.infer<typeof PromptResponseSchema>

export const SERVER_ACTION_SCHEMA = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('response-chunk'),
    userInputId: z.string(),
    chunk: z.union([z.string(), printModeEventSchema]),
  }),
  z.object({
    type: z.literal('subagent-response-chunk'),
    userInputId: z.string(),
    agentId: z.string(),
    agentType: z.string(),
    chunk: z.string(),
    prompt: z.string().optional(),
    forwardToPrompt: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('handlesteps-log-chunk'),
    userInputId: z.string(),
    agentId: z.string(),
    level: z.enum(['debug', 'info', 'warn', 'error']),
    data: z.any(),
    message: z.string().optional(),
  }),
  PromptResponseSchema,
  z.object({
    type: z.literal('read-files'),
    filePaths: z.array(z.string()),
    requestId: z.string(),
  }),
  z.object({
    type: z.literal('tool-call-request'),
    userInputId: z.string(),
    requestId: z.string(),
    toolName: z.string(),
    input: z.record(z.string(), z.any()),
    timeout: z.number().optional(),
    mcpConfig: mcpConfigSchema.optional(),
  }),
  InitResponseSchema,
  UsageReponseSchema,
  MessageCostResponseSchema,

  z.object({
    type: z.literal('action-error'),
    message: z.string(),
    error: z.string().optional(),
    remainingBalance: z.number().optional(),
  }),
  z.object({
    type: z.literal('prompt-error'),
    userInputId: z.string(),
    message: z.string(),
    error: z.string().optional(),
    remainingBalance: z.number().optional(),
  }),
  z.object({
    // The server is imminently going to shutdown, and the client should reconnect
    type: z.literal('request-reconnect'),
  }),
  z.object({
    type: z.literal('request-mcp-tool-data'),
    requestId: z.string(),
    mcpConfig: mcpConfigSchema,
    toolNames: z.string().array().optional(),
  }),
])

type ServerActionAny = z.infer<typeof SERVER_ACTION_SCHEMA>
export type ServerAction<
  T extends ServerActionAny['type'] = ServerActionAny['type'],
> = Extract<ServerActionAny, { type: T }>
