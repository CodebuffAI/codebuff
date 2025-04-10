import { z } from 'zod'
import { FileVersionSchema, ProjectFileContextSchema } from './util/file'
import { costModes } from './constants'
import {
  AgentStateSchema,
  ToolResultSchema,
  ToolCallSchema as NewToolCallSchema,
} from './types/agent-state'
import { MessageSchema } from './types/message'
import { grantTypeEnum } from './db/schema'

export const FileChangeSchema = z.object({
  type: z.enum(['patch', 'file']),
  path: z.string(),
  content: z.string(),
})
export type FileChange = z.infer<typeof FileChangeSchema>
export const CHANGES = z.array(FileChangeSchema)
export type FileChanges = z.infer<typeof CHANGES>

export const ToolCallSchema = z.object({
  name: z.string(),
  id: z.string(),
  input: z.record(z.string(), z.any()),
})
export type ToolCall = z.infer<typeof ToolCallSchema>

export const CLIENT_ACTION_SCHEMA = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('prompt'),
    promptId: z.string(),
    prompt: z.string().or(z.undefined()),
    fingerprintId: z.string(),
    authToken: z.string().optional(),
    costMode: z.enum(costModes).optional().default('normal'),
    agentState: AgentStateSchema,
    toolResults: z.array(ToolResultSchema),
  }),
  z.object({
    type: z.literal('read-files-response'),
    files: z.record(z.string(), z.union([z.string(), z.null()])),
    requestId: z.string().optional(),
  }),
  z.object({
    type: z.literal('init'),
    fingerprintId: z.string(),
    authToken: z.string().optional(),
    fileContext: ProjectFileContextSchema,
  }),
  z.object({
    type: z.literal('generate-commit-message'),
    fingerprintId: z.string(),
    authToken: z.string().optional(),
    stagedChanges: z.string(),
  }),
])
export type ClientAction = z.infer<typeof CLIENT_ACTION_SCHEMA>

export const UsageReponseSchema = z.object({
  type: z.literal('usage-response'),
  usage: z.number(),
  remainingBalance: z.number(),
  balanceBreakdown: z
    .record(z.enum(grantTypeEnum.enumValues), z.number())
    .optional(),
  next_quota_reset: z.coerce.date().nullable(),
  nextMonthlyGrant: z.number(),
  autoTopupAdded: z.number().optional(),
})
export type UsageResponse = z.infer<typeof UsageReponseSchema>

export const InitResponseSchema = z
  .object({
    type: z.literal('init-response'),
  })
  .merge(
    UsageReponseSchema.omit({
      type: true,
    })
  )
export type InitResponse = z.infer<typeof InitResponseSchema>

export const ResponseCompleteSchema = z
  .object({
    type: z.literal('response-complete'),
    userInputId: z.string(),
    response: z.string(),
    changes: CHANGES,
    changesAlreadyApplied: CHANGES,
    addedFileVersions: z.array(FileVersionSchema),
    resetFileVersions: z.boolean(),
  })
  .merge(
    UsageReponseSchema.omit({
      type: true,
    }).partial()
  )

export const MessageCostResponseSchema = z.object({
  type: z.literal('message-cost-response'),
  promptId: z.string(),
  credits: z.number(),
})
export type MessageCostResponse = z.infer<typeof MessageCostResponseSchema>

export const PromptResponseSchema = z.object({
  type: z.literal('prompt-response'),
  promptId: z.string(),
  agentState: AgentStateSchema,
  toolCalls: z.array(NewToolCallSchema),
  toolResults: z.array(ToolResultSchema),
})
export type PromptResponse = z.infer<typeof PromptResponseSchema>

export const SERVER_ACTION_SCHEMA = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('response-chunk'),
    userInputId: z.string(),
    chunk: z.string(),
  }),
  ResponseCompleteSchema,
  PromptResponseSchema,
  z.object({
    type: z.literal('read-files'),
    filePaths: z.array(z.string()),
    requestId: z.string(),
  }),
  z.object({
    type: z.literal('tool-call'),
    userInputId: z.string(),
    response: z.string(),
    data: ToolCallSchema,
    changes: CHANGES,
    changesAlreadyApplied: CHANGES,
    addedFileVersions: z.array(FileVersionSchema),
    resetFileVersions: z.boolean(),
  }),
  z.object({
    type: z.literal('terminal-command-result'),
    userInputId: z.string(),
    result: z.string(),
  }),
  z.object({
    type: z.literal('npm-version-status'),
    isUpToDate: z.boolean(),
    latestVersion: z.string(),
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
    type: z.literal('commit-message-response'),
    commitMessage: z.string(),
  }),
])

export type ServerAction = z.infer<typeof SERVER_ACTION_SCHEMA>
