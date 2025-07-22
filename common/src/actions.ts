import { z } from 'zod'

import { costModes } from './constants'
import { GrantTypeValues } from './types/grant'
import {
  SessionStateSchema,
  toolCallSchema,
  toolResultSchema,
} from './types/session-state'
import { FileVersionSchema, ProjectFileContextSchema } from './util/file'

export const FileChangeSchema = z.object({
  type: z.enum(['patch', 'file']),
  path: z.string(),
  content: z.string(),
})
export type FileChange = z.infer<typeof FileChangeSchema>
export const CHANGES = z.array(FileChangeSchema)
export type FileChanges = z.infer<typeof CHANGES>

export const CLIENT_ACTION_SCHEMA = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('prompt'),
    promptId: z.string(),
    prompt: z.string().or(z.undefined()),
    promptParams: z.record(z.string(), z.any()).optional(), // Additional json params.
    fingerprintId: z.string(),
    authToken: z.string().optional(),
    costMode: z.enum(costModes).optional().default('normal'),
    sessionState: SessionStateSchema,
    toolResults: z.array(toolResultSchema),
    model: z.string().optional(),
    repoUrl: z.string().optional(),
    agentId: z.string().optional(),
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
    repoUrl: z.string().optional(),
  }),
  z.object({
    type: z.literal('generate-commit-message'),
    fingerprintId: z.string(),
    authToken: z.string().optional(),
    stagedChanges: z.string(),
  }),
  z.object({
    type: z.literal('tool-call-response'),
    requestId: z.string(),
    success: z.boolean(),
    result: z.any().optional(), // Tool execution result
    error: z.string().optional(), // Error message if execution failed
  }),
  z.object({
    type: z.literal('cancel-user-input'),
    authToken: z.string(),
    promptId: z.string(),
  }),
])

export type ClientAction = z.infer<typeof CLIENT_ACTION_SCHEMA>

export const UsageReponseSchema = z.object({
  type: z.literal('usage-response'),
  usage: z.number(),
  remainingBalance: z.number(),
  balanceBreakdown: z
    .record(
      z.enum([GrantTypeValues[0], ...GrantTypeValues.slice(1)]),
      z.number()
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
  sessionState: SessionStateSchema,
  toolCalls: z.array(toolCallSchema),
  toolResults: z.array(toolResultSchema),
})
export type PromptResponse = z.infer<typeof PromptResponseSchema>

export const SERVER_ACTION_SCHEMA = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('response-chunk'),
    userInputId: z.string(),
    chunk: z.string(),
  }),
  z.object({
    type: z.literal('subagent-response-chunk'),
    userInputId: z.string(),
    agentId: z.string(),
    agentType: z.string(),
    chunk: z.string(),
    prompt: z.string().optional(),
  }),
  ResponseCompleteSchema,
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
    args: z.record(z.any()),
    timeout: z.number().optional(),
  }),
  z.object({
    type: z.literal('tool-call'),
    userInputId: z.string(),
    response: z.string(),
    data: toolCallSchema,
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
  z.object({
    // The server is imminently going to shutdown, and the client should reconnect
    type: z.literal('request-reconnect'),
  }),
])

export type ServerAction = z.infer<typeof SERVER_ACTION_SCHEMA>
