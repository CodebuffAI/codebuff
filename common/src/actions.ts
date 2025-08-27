import { z } from 'zod/v4'

import { costModes } from './constants'
import { GrantTypeValues } from './types/grant'
import {
  toolResultOutputSchema,
  toolResultPartSchema,
} from './types/messages/content-part'
import { printModeEventSchema } from './types/print-mode'
import { SessionStateSchema, toolCallSchema } from './types/session-state'
import { ProjectFileContextSchema } from './util/file'

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
    toolResults: z.array(toolResultPartSchema),
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
    type: z.literal('tool-call-response'),
    requestId: z.string(),
    output: toolResultOutputSchema.array(),
  }),
  z.object({
    type: z.literal('cancel-user-input'),
    authToken: z.string(),
    promptId: z.string(),
  }),
])

type ClientActionAny = z.infer<typeof CLIENT_ACTION_SCHEMA>
export type ClientAction<
  T extends ClientActionAny['type'] = ClientActionAny['type'],
> = Extract<ClientActionAny, { type: T }>

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
  toolCalls: z.array(toolCallSchema),
  toolResults: z.array(toolResultPartSchema),
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
])

type ServerActionAny = z.infer<typeof SERVER_ACTION_SCHEMA>
export type ServerAction<
  T extends ServerActionAny['type'] = ServerActionAny['type'],
> = Extract<ServerActionAny, { type: T }>
